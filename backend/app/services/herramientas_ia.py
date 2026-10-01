"""
Ejecución de las funciones (tools) que pide el modelo — HU-33.

El modelo solo PIDE ejecutar una función; aquí se decide si se hace.
Los argumentos llegan tal como los escribió el modelo y se tratan
como entrada no confiable: se validan con Pydantic, los nombres
("Dermatología", "Medellin", "Laureles") se resuelven contra el
catálogo real, y cualquier problema se le devuelve al modelo como un
error en texto para que le pregunte al paciente, nunca como una
excepción que rompa la conversación.

Las escrituras se validan además contra lo que el backend recuerda de
la conversación (EstadoConversacion), no contra lo que el modelo dice
que pasó:
- solo se agenda o reprograma hacia un horario que el backend realmente
  le mostró al paciente en esta conversación;
- agendar, cancelar y reprogramar exigen confirmación: la primera
  llamada solo devuelve un resumen, y la acción se ejecuta únicamente si
  el modelo la vuelve a pedir, con los mismos datos, en un mensaje
  POSTERIOR del paciente.

No se escribe ninguna consulta nueva: todo pasa por los repositorios
y servicios que ya usan los endpoints.
"""

import json
import unicodedata
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from app.models.cita import CanalContacto, Cita
from app.models.disponibilidad import Disponibilidad
from app.models.especialista import Modalidad
from app.models.paciente import Paciente
from app.repositories import (
    cita_repository,
    disponibilidad_repository,
    especialidad_repository,
    sede_repository,
)
from app.services import citas_service, comprobante_service, ia
from app.services.auditoria_service import Actor
from app.services.exceptions import (
    CitaNoEncontradaError,
    CitaNoModificableError,
    DisponibilidadNoEncontradaError,
    FueraDeHorarioDeLlegadaError,
    HorarioYaNoDisponibleError,
    ReprogramacionInvalidaError,
)
from app.utils.tiempo import DIAS_SEMANA, ahora_colombia, hoy_en_colombia

# Tope de resultados por búsqueda: la lista completa podría tener
# cientos de franjas, y todo lo que se devuelve viaja al modelo.
_MAX_HORARIOS = 8
# El asistente muestra máximo 3 opciones al paciente; más alternativas
# solo gastarían tokens.
_MAX_ALTERNATIVAS = 3
_MAX_CITAS = 5


@dataclass
class _HorarioOfrecido:
    inicio: datetime  # fecha + hora de la franja, hora de Colombia
    resumen: dict  # lo que se le mostró al modelo, para armar la confirmación


@dataclass
class EstadoConversacion:
    """
    Lo que el backend recuerda de una conversación para validar las
    escrituras. Vive en memoria junto al historial (chatbot.py), que
    incrementa `turno` con cada mensaje del paciente.
    """

    turno: int = 0
    horarios_ofrecidos: dict[uuid.UUID, _HorarioOfrecido] = field(default_factory=dict)
    # Acción esperando el "sí" del paciente -> turno en que se le mostró
    # el resumen. La clave incluye todos los datos de la acción (p. ej.
    # ("crear", horario, canal)): si el paciente cambia algo, es otra
    # acción y hay que volver a confirmar.
    confirmaciones_pendientes: dict[tuple, int] = field(default_factory=dict)
    # disponibilidad_id -> resumen de la cita, para no agendar dos veces
    # si el modelo repite la llamada.
    citas_creadas: dict[uuid.UUID, dict] = field(default_factory=dict)
    # Acciones completadas, para que el chat muestre el resultado como
    # tarjeta: ("cita_agendada" | "cita_cancelada" | "cita_reprogramada"
    # | "asistencia_confirmada", resumen de la cita).
    eventos: list[tuple[str, dict]] = field(default_factory=list)


class _ErrorParaElModelo(Exception):
    """Algo que el modelo debe corregir o preguntarle al paciente."""


def _actor(paciente: Paciente) -> Actor:
    # En la auditoría queda que la acción la pidió el paciente por el chat.
    return Actor.de_paciente(paciente, via="asistente")


def _error(mensaje: str) -> dict:
    return {"error": mensaje}


def _validar[M: BaseModel](modelo: type[M], args: dict, funcion: str) -> M:
    try:
        return modelo.model_validate(args)
    except ValidationError as e:
        raise _ErrorParaElModelo(f"Parámetros inválidos para {funcion}: {e.errors()[0]['msg']}")


def _normalizar(texto: str) -> str:
    # "Medellín", "medellin " y "MEDELLÍN" deben coincidir.
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return " ".join(sin_tildes.lower().split())


def _resolver[T](pedido: str, opciones: list[T], nombre_de: Callable[[T], str], que: str) -> T:
    """
    Encuentra en el catálogo la opción que el modelo quiso decir.
    Primero coincidencia exacta; si no, una única coincidencia parcial
    ("Laureles" -> "Sede Laureles", "Sede Laureles Medellín" -> "Sede
    Laureles"). Si hay varias o ninguna, no se adivina: se devuelve la
    lista de opciones para preguntar.
    """
    buscado = _normalizar(pedido)
    for opcion in opciones:
        if _normalizar(nombre_de(opcion)) == buscado:
            return opcion

    parciales = [
        o
        for o in opciones
        if buscado in _normalizar(nombre_de(o)) or _normalizar(nombre_de(o)) in buscado
    ]
    if len(parciales) == 1:
        return parciales[0]

    nombres = ", ".join(nombre_de(o) for o in (parciales or opciones))
    if parciales:
        raise _ErrorParaElModelo(
            f"'{pedido}' coincide con varias {que}: {nombres}. Pregúntale al paciente cuál."
        )
    raise _ErrorParaElModelo(
        f"'{pedido}' no está entre las {que} disponibles. Opciones válidas: {nombres}."
    )


def _franja_para_ia(d: Disponibilidad) -> dict:
    return {
        "especialidad": d.especialista.especialidad.nombre,
        "profesional": d.especialista.nombre,
        "sede": d.sede.nombre,
        "ciudad": d.sede.ciudad,
        "modalidad": d.modalidad.value,
        "fecha": d.fecha.isoformat(),
        "dia": DIAS_SEMANA[d.fecha.weekday()],
        "hora": d.hora.strftime("%H:%M"),
    }


def _horario_para_ia(d: Disponibilidad) -> dict:
    return {"disponibilidad_id": str(d.id), **_franja_para_ia(d)}


def _cita_para_ia(cita: Cita) -> dict:
    return {
        "numero_comprobante": cita.numero_comprobante,
        **_franja_para_ia(cita.disponibilidad),
        "recordatorio_por": cita.canal_recordatorio.value,
        "estado": citas_service.ESTADOS_VISIBLES[citas_service.estado_visible(cita)],
    }


def _registrar_ofrecidos(estado: EstadoConversacion, horarios: list[Disponibilidad]) -> None:
    for h in horarios:
        estado.horarios_ofrecidos[h.id] = _HorarioOfrecido(
            datetime.combine(h.fecha, h.hora), _franja_para_ia(h)
        )


def _pedir_confirmacion(estado: EstadoConversacion, clave: tuple, respuesta: dict) -> dict | None:
    """
    Confirmación obligatoria, impuesta por el backend. Devuelve None si
    la acción ya fue confirmada (el modelo la pide de nuevo, con los
    mismos datos, en un mensaje posterior del paciente); si no, registra
    la acción como pendiente y devuelve el resumen para mostrarle al
    paciente. Así el modelo no puede ejecutar por su cuenta en el mismo
    turno, ni saltarse el "¿confirma?".
    """
    turno_mostrado = estado.confirmaciones_pendientes.get(clave)
    if turno_mostrado is not None and estado.turno > turno_mostrado:
        del estado.confirmaciones_pendientes[clave]
        return None
    estado.confirmaciones_pendientes[clave] = estado.turno
    return {"requiere_confirmacion": True, **respuesta}


def _cita_por_numero(db: Session, paciente: Paciente, numero: str) -> Cita:
    # Siempre entre las citas del paciente del JWT: el modelo no tiene
    # forma de llegar a una cita de otra persona.
    buscado = numero.strip().upper()
    for cita in cita_repository.listar_por_paciente(db, paciente.id):
        if (cita.numero_comprobante or "").upper() == buscado:
            return cita
    raise _ErrorParaElModelo(f"El paciente no tiene ninguna cita con el número {buscado}.")


# --- Solo lectura: catálogo (HU-09, HU-10, HU-11, HU-13, HU-14) ---


def _buscar_especialidades(db: Session, _p: Paciente, _e: EstadoConversacion, _a: dict) -> dict:
    return {"especialidades": [e.nombre for e in especialidad_repository.listar_especialidades(db)]}


def _buscar_sedes(db: Session, _p: Paciente, _e: EstadoConversacion, _a: dict) -> dict:
    return {
        "sedes": [{"nombre": s.nombre, "ciudad": s.ciudad} for s in sede_repository.listar_sedes(db)]
    }


class _BuscarHorariosArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    especialidad: str | None = Field(default=None, max_length=80)
    sede: str | None = Field(default=None, max_length=100)
    ciudad: str | None = Field(default=None, max_length=80)
    fecha: date | None = None
    modalidad: Modalidad | None = None

    @field_validator("especialidad", "sede", "ciudad")
    @classmethod
    def _vacio_es_none(cls, valor: str | None) -> str | None:
        return valor if valor and valor.strip() else None


def _buscar_horarios(
    db: Session, _p: Paciente, estado: EstadoConversacion, args: dict
) -> dict:
    filtros = _validar(_BuscarHorariosArgs, args, "buscar_horarios")

    especialidad_id = None
    if filtros.especialidad:
        especialidad = _resolver(
            filtros.especialidad,
            especialidad_repository.listar_especialidades(db),
            lambda e: e.nombre,
            "especialidades",
        )
        especialidad_id = especialidad.id

    sedes = sede_repository.listar_sedes(db)
    sede = None
    if filtros.sede:
        sede = _resolver(filtros.sede, sedes, lambda s: s.nombre, "sedes")

    ciudad = None
    if filtros.ciudad:
        ciudades = sorted({s.ciudad for s in sedes})
        ciudad = _resolver(filtros.ciudad, ciudades, lambda c: c, "ciudades")
        if sede is not None and sede.ciudad != ciudad:
            raise _ErrorParaElModelo(
                f"La {sede.nombre} queda en {sede.ciudad}, no en {ciudad}. Pregúntale al paciente cuál prefiere."
            )

    if filtros.fecha is not None and filtros.fecha < hoy_en_colombia():
        raise _ErrorParaElModelo(f"La fecha {filtros.fecha.isoformat()} ya pasó.")

    # El repositorio ya devuelve solo franjas libres que todavía no empiezan.
    horarios = disponibilidad_repository.buscar_disponibilidad(
        db,
        especialidad_id=especialidad_id,
        ciudad=ciudad,
        sede_id=sede.id if sede else None,
        modalidad=filtros.modalidad,
        fecha=filtros.fecha,
    )
    mostrados = horarios[:_MAX_HORARIOS]
    resultado = {"total": len(horarios), "horarios": [_horario_para_ia(h) for h in mostrados]}
    if len(horarios) > _MAX_HORARIOS:
        resultado["nota"] = f"Se muestran los primeros {_MAX_HORARIOS} de {len(horarios)}."

    # Sin cupo con todos los filtros: en vez de solo decir "no hay", se
    # ofrecen los horarios más cercanos de la misma especialidad en
    # cualquier sede, fecha o modalidad (la IA no debe negar una cita
    # si hay disponibilidad en otra parte).
    hubo_otros_filtros = any([sede, ciudad, filtros.fecha, filtros.modalidad])
    if not horarios and hubo_otros_filtros:
        alternativas = disponibilidad_repository.buscar_disponibilidad(
            db, especialidad_id=especialidad_id
        )[:_MAX_ALTERNATIVAS]
        mostrados = alternativas
        resultado["alternativas"] = [_horario_para_ia(h) for h in alternativas]
        resultado["nota"] = (
            "No hay horarios con todos esos filtros. Las alternativas son los más cercanos "
            "de la misma especialidad; ofrécelas sin agendar ninguna hasta que el paciente elija."
        )

    _registrar_ofrecidos(estado, mostrados)
    return resultado


# --- Citas del paciente autenticado (HU-16/17, HU-18, HU-20, HU-21, HU-26/27, HU-29) ---


class _ConsultarCitaArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    numero_comprobante: str | None = Field(default=None, max_length=20)


def _consultar_cita(db: Session, paciente: Paciente, _e: EstadoConversacion, args: dict) -> dict:
    datos = _validar(_ConsultarCitaArgs, args, "consultar_cita")

    if datos.numero_comprobante and datos.numero_comprobante.strip():
        # HU-18: el estado de una cita concreta, en cualquier estado.
        return {"total": 1, "citas": [_cita_para_ia(_cita_por_numero(db, paciente, datos.numero_comprobante))]}

    # HU-27: próximas citas (las mismas de la pestaña "Próximas" de "Mis citas").
    citas = [
        c
        for c in cita_repository.listar_por_paciente(db, paciente.id)
        if citas_service.estado_visible(c) in citas_service.ESTADOS_ACTIVOS
    ]
    resultado = {"total": len(citas), "citas": [_cita_para_ia(c) for c in citas[:_MAX_CITAS]]}
    if len(citas) > _MAX_CITAS:
        resultado["nota"] = f"Se muestran las {_MAX_CITAS} más próximas de {len(citas)}."
    return resultado


def _consultar_historial(db: Session, paciente: Paciente, _e: EstadoConversacion, _a: dict) -> dict:
    # HU-28: anteriores, canceladas y reprogramadas, de la más reciente a
    # la más antigua; siempre del paciente del JWT.
    citas = [c for c in cita_repository.listar_por_paciente(db, paciente.id) if citas_service.es_del_historial(c)]
    citas.reverse()
    resultado = {"total": len(citas), "citas": [_cita_para_ia(c) for c in citas[:_MAX_CITAS]]}
    if len(citas) > _MAX_CITAS:
        resultado["nota"] = (
            f"Se muestran las {_MAX_CITAS} más recientes de {len(citas)}. "
            "El historial completo está en 'Mis citas' > 'Historial'."
        )
    return resultado


class _CrearCitaArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    disponibilidad_id: uuid.UUID
    canal_recordatorio: CanalContacto


def _crear_cita(db: Session, paciente: Paciente, estado: EstadoConversacion, args: dict) -> dict:
    datos = _validar(_CrearCitaArgs, args, "crear_cita")

    # El modelo repitió la llamada: no se agenda dos veces.
    if datos.disponibilidad_id in estado.citas_creadas:
        return {
            "cita": estado.citas_creadas[datos.disponibilidad_id],
            "nota": "Esta cita ya había quedado agendada en esta conversación.",
        }

    ofrecido = estado.horarios_ofrecidos.get(datos.disponibilidad_id)
    if ofrecido is None:
        # Un id inventado, o copiado de otro lado: solo se agenda lo que
        # el backend realmente le mostró al paciente en esta conversación.
        raise _ErrorParaElModelo(
            "Ese horario no salió de ninguna búsqueda de esta conversación. "
            "Usa buscar_horarios y deja que el paciente elija."
        )
    if ofrecido.inicio <= ahora_colombia():
        raise _ErrorParaElModelo("Ese horario ya pasó. Busca otro y ofréceselo al paciente.")

    pendiente = _pedir_confirmacion(
        estado,
        ("crear", datos.disponibilidad_id, datos.canal_recordatorio),
        {
            "resumen": {**ofrecido.resumen, "recordatorio_por": datos.canal_recordatorio.value},
            "instruccion": (
                "Todavía NO está agendada. Muéstrale este resumen al paciente y pregúntale si "
                "confirma. Solo si responde que sí, vuelve a llamar crear_cita con los mismos datos."
            ),
        },
    )
    if pendiente is not None:
        return pendiente

    # --- La misma lógica que POST /citas (HU-16 + HU-17) ---
    # confirmar_cita bloquea la fila y verifica que el horario siga libre.
    try:
        cita = citas_service.confirmar_cita(
            db, paciente.id, datos.disponibilidad_id, datos.canal_recordatorio,
            actor=_actor(paciente),
        )
    except (DisponibilidadNoEncontradaError, HorarioYaNoDisponibleError):
        # Libera el bloqueo de fila: la sesión sigue en uso durante el
        # resto de la conversación de esta petición.
        db.rollback()
        raise _ErrorParaElModelo(
            "Ese horario ya no está disponible. Busca otro y ofréceselo al paciente."
        )
    cita = comprobante_service.generar_comprobante(db, cita)

    resumen = _cita_para_ia(cita)
    estado.citas_creadas[datos.disponibilidad_id] = resumen
    estado.eventos.append(("cita_agendada", resumen))
    return {"cita": resumen, "mensaje": "Cita agendada y comprobante generado."}


class _NumeroArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    numero_comprobante: str = Field(min_length=1, max_length=20)


def _confirmar_asistencia(
    db: Session, paciente: Paciente, estado: EstadoConversacion, args: dict
) -> dict:
    datos = _validar(_NumeroArgs, args, "confirmar_asistencia")
    cita = _cita_por_numero(db, paciente, datos.numero_comprobante)
    try:
        citas_service.confirmar_asistencia(db, paciente.id, cita.id, actor=_actor(paciente))
    except CitaNoModificableError as e:
        raise _ErrorParaElModelo(str(e))

    resumen = _cita_para_ia(citas_service.obtener_del_paciente(db, paciente.id, cita.id))
    estado.eventos.append(("asistencia_confirmada", resumen))
    return {"cita": resumen, "mensaje": "Asistencia confirmada."}


def _registrar_llegada(
    db: Session, paciente: Paciente, estado: EstadoConversacion, args: dict
) -> dict:
    datos = _validar(_NumeroArgs, args, "registrar_llegada")
    cita = _cita_por_numero(db, paciente, datos.numero_comprobante)
    try:
        citas_service.registrar_llegada(db, paciente.id, cita.id, actor=_actor(paciente))
    except (CitaNoModificableError, FueraDeHorarioDeLlegadaError) as e:
        raise _ErrorParaElModelo(str(e))

    resumen = _cita_para_ia(citas_service.obtener_del_paciente(db, paciente.id, cita.id))
    estado.eventos.append(("llegada_registrada", resumen))
    return {
        "cita": resumen,
        "mensaje": "Llegada registrada. Indícale que espere su turno y que muestre su "
        "número de comprobante en recepción si se lo piden.",
    }


class _CancelarArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    numero_comprobante: str = Field(min_length=1, max_length=20)
    motivo: str | None = Field(default=None, max_length=300)


def _cancelar_cita(db: Session, paciente: Paciente, estado: EstadoConversacion, args: dict) -> dict:
    datos = _validar(_CancelarArgs, args, "cancelar_cita")
    cita = _cita_por_numero(db, paciente, datos.numero_comprobante)
    if not citas_service.esta_activa(cita):
        raise _ErrorParaElModelo(
            f"Esa cita no se puede cancelar: está {_cita_para_ia(cita)['estado'].lower()}."
        )

    # HU-21, criterio 2: confirmación antes de cancelar.
    pendiente = _pedir_confirmacion(
        estado,
        ("cancelar", cita.id),
        {
            "resumen": _cita_para_ia(cita),
            "instruccion": (
                "Todavía NO está cancelada. Muéstrale al paciente cuál cita se cancelaría y "
                "pregúntale si confirma. Solo si dice que sí, vuelve a llamar cancelar_cita."
            ),
        },
    )
    if pendiente is not None:
        return pendiente

    try:
        cancelada = citas_service.cancelar_cita(
            db, paciente.id, cita.id, datos.motivo, actor=_actor(paciente)
        )
    except (CitaNoEncontradaError, CitaNoModificableError) as e:
        raise _ErrorParaElModelo(str(e))

    resumen = _cita_para_ia(cancelada)
    estado.eventos.append(("cita_cancelada", resumen))
    return {"cita": resumen, "mensaje": "Cita cancelada y cupo liberado."}


class _ReprogramarArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    numero_comprobante: str = Field(min_length=1, max_length=20)
    nueva_disponibilidad_id: uuid.UUID


def _reprogramar_cita(
    db: Session, paciente: Paciente, estado: EstadoConversacion, args: dict
) -> dict:
    datos = _validar(_ReprogramarArgs, args, "reprogramar_cita")
    cita = _cita_por_numero(db, paciente, datos.numero_comprobante)
    if not citas_service.esta_activa(cita):
        raise _ErrorParaElModelo(
            f"Esa cita no se puede reprogramar: está {_cita_para_ia(cita)['estado'].lower()}."
        )

    ofrecido = estado.horarios_ofrecidos.get(datos.nueva_disponibilidad_id)
    if ofrecido is None:
        raise _ErrorParaElModelo(
            "Ese horario nuevo no salió de ninguna búsqueda de esta conversación. "
            "Usa buscar_horarios con la misma especialidad y deja que el paciente elija."
        )

    # HU-20, criterio 4 + confirmación obligatoria antes de cambiar nada.
    pendiente = _pedir_confirmacion(
        estado,
        ("reprogramar", cita.id, datos.nueva_disponibilidad_id),
        {
            "cita_actual": _cita_para_ia(cita),
            "nuevo_horario": ofrecido.resumen,
            "instruccion": (
                "Todavía NO se ha cambiado. Muéstrale al paciente el cambio (de qué fecha y "
                "hora a cuál) y pregúntale si confirma. Solo si dice que sí, vuelve a llamar "
                "reprogramar_cita con los mismos datos."
            ),
        },
    )
    if pendiente is not None:
        return pendiente

    try:
        nueva = citas_service.reprogramar_cita(
            db, paciente.id, cita.id, datos.nueva_disponibilidad_id, actor=_actor(paciente)
        )
    except (
        CitaNoEncontradaError,
        CitaNoModificableError,
        DisponibilidadNoEncontradaError,
        HorarioYaNoDisponibleError,
        ReprogramacionInvalidaError,
    ) as e:
        raise _ErrorParaElModelo(f"{e} Busca otro horario y ofréceselo al paciente.")
    nueva = comprobante_service.generar_comprobante(db, nueva)

    resumen = _cita_para_ia(nueva)
    estado.eventos.append(("cita_reprogramada", resumen))
    return {
        "cita": resumen,
        "cita_anterior": datos.numero_comprobante.upper(),
        "mensaje": "Cita reprogramada: la nueva cita tiene su propio comprobante.",
    }


_Manejador = Callable[[Session, Paciente, EstadoConversacion, dict], dict]

_MANEJADORES: dict[str, _Manejador] = {
    "buscar_especialidades": _buscar_especialidades,
    "buscar_sedes": _buscar_sedes,
    "buscar_horarios": _buscar_horarios,
    "consultar_cita": _consultar_cita,
    "consultar_historial": _consultar_historial,
    "crear_cita": _crear_cita,
    "confirmar_asistencia": _confirmar_asistencia,
    "registrar_llegada": _registrar_llegada,
    "cancelar_cita": _cancelar_cita,
    "reprogramar_cita": _reprogramar_cita,
}


def ejecutar(
    db: Session,
    paciente: Paciente,
    estado: EstadoConversacion,
    nombre: str,
    argumentos_json: str | None,
) -> dict:
    """
    Ejecuta una tool pedida por el modelo y devuelve un dict listo para
    enviarle de vuelta como resultado. Nunca lanza por culpa del modelo:
    función desconocida, JSON roto o parámetros inválidos se devuelven
    como {"error": ...}.

    `paciente` sale siempre del JWT (routers/chat.py), nunca del modelo.
    """
    manejador = _MANEJADORES.get(nombre)
    if nombre not in ia.TOOLS_HABILITADAS or manejador is None:
        return _error(f"La función '{nombre}' no está disponible.")

    try:
        args = json.loads(argumentos_json or "{}")
    except json.JSONDecodeError:
        return _error("Los argumentos no son un JSON válido.")
    if not isinstance(args, dict):
        return _error("Los argumentos deben ser un objeto JSON.")

    try:
        return manejador(db, paciente, estado, args)
    except _ErrorParaElModelo as e:
        return _error(str(e))
