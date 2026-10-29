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

Lo que se hace en una pantalla (radicar una petición, pagar, ver la
fórmula, aceptar un cupo de la lista de espera) Eli no lo hace por el
paciente: ofrecer_enlace le pone un botón debajo del mensaje que lo lleva
a esa pantalla. La ruta la arma el backend (DESTINOS), nunca el modelo.

No se escribe ninguna consulta nueva: todo pasa por los repositorios
y servicios que ya usan los endpoints.
"""

import json
import unicodedata
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cita import CanalContacto, Cita
from app.models.disponibilidad import Disponibilidad
from app.models.eps import Eps
from app.models.especialidad import Especialidad
from app.models.especialista import Especialista, Modalidad
from app.models.lista_espera import EstadoSolicitud, Jornada
from app.models.paciente import Paciente
from app.models.sede import Sede
from app.models.solicitud_cita import EstadoSolicitudCita, TipoSolicitud
from app.repositories import (
    cita_repository,
    disponibilidad_repository,
    especialidad_repository,
    especialista_repository,
    lista_espera_repository,
    sede_repository,
    solicitud_cita_repository,
)
from app.services import citas_service, comprobante_service, eps_service, ia, lista_espera_service, pagos_service
from app.services.auditoria_service import Actor
from app.services.exceptions import (
    CitaNoEncontradaError,
    CitaNoModificableError,
    DisponibilidadNoEncontradaError,
    FueraDeHorarioDeLlegadaError,
    HorarioYaNoDisponibleError,
    ListaEsperaInvalidaError,
    MedicoDeOtraEpsError,
    ReprogramacionInvalidaError,
)
from app.utils.tiempo import DIAS_SEMANA, ZONA_COLOMBIA, ahora_colombia, hoy_en_colombia

# Tope de resultados por búsqueda: la lista completa podría tener
# cientos de franjas, y todo lo que se devuelve viaja al modelo.
_MAX_HORARIOS = 8
# El asistente muestra máximo 3 opciones al paciente; más alternativas
# solo gastarían tokens.
_MAX_ALTERNATIVAS = 3
_MAX_CITAS = 5
# Botones a otras pantallas debajo de un mismo mensaje.
_MAX_ENLACES = 2

# Pantallas a las que Eli puede llevar al paciente: (texto del botón, ruta).
DESTINOS = {
    "agendar": ("Agendar una cita", "/panel"),
    "mis_citas": ("Ver mis citas", "/mis-citas"),
    "formula": ("Ver mi fórmula en Mis citas", "/mis-citas"),
    "peticion": ("Solicitar petición", "/solicitudes?tipo=formal"),
    "derecho_de_peticion": ("Radicar derecho de petición", "/solicitudes?tipo=derecho_peticion"),
    "mis_peticiones": ("Ver mis peticiones", "/solicitudes"),
    "lista_espera": ("Pedir aviso de cupo", "/lista-espera"),
    "mi_lista_espera": ("Ver mi lista de espera", "/lista-espera"),
}
# Los que pueden llevar ya elegida la especialidad.
_CON_ESPECIALIDAD = {"agendar", "peticion", "derecho_de_peticion", "lista_espera"}

TIPO_PETICION = {TipoSolicitud.FORMAL: "Petición de cita", TipoSolicitud.DERECHO_PETICION: "Derecho de petición"}
ESTADO_PETICION = {
    EstadoSolicitudCita.PENDIENTE: "En revisión por el personal de SaludYA",
    EstadoSolicitudCita.PENDIENTE_EPS: "En trámite con su EPS",
    EstadoSolicitudCita.APROBADA: "Aprobada: ya tiene la cita asignada",
    EstadoSolicitudCita.NEGADA: "No aprobada",
}
JORNADA = {Jornada.MANANA: "en la mañana", Jornada.TARDE: "en la tarde", Jornada.CUALQUIERA: "a cualquier hora"}


@dataclass
class _HorarioOfrecido:
    inicio: datetime  # fecha + hora de la franja, hora de Colombia
    resumen: dict  # lo que se le mostró al modelo, para armar la confirmación
    especialidad_id: uuid.UUID  # para que el chat ofrezca la carta de esa especialidad


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
    # La cita que se le propuso al paciente y espera su "sí" (crear_cita
    # sin confirmar), con el turno en que se propuso: el chat la muestra
    # como tarjeta con "Agendar esa cita" / "Elegir otra fecha".
    propuesta: dict | None = None
    propuesta_turno: int = 0
    # Botones a otras pantallas para el mensaje en curso: [(turno, {"texto", "ruta"})].
    enlaces: list[tuple[int, dict]] = field(default_factory=list)


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


def pesos(valor: int) -> str:
    """8000 -> "$8.000", como se escribe en Colombia."""
    return f"${valor:,}".replace(",", ".")


def _agregar_enlace(estado: EstadoConversacion, texto: str, ruta: str) -> None:
    estado.enlaces = [(turno, e) for turno, e in estado.enlaces if turno == estado.turno]
    if len(estado.enlaces) < _MAX_ENLACES and all(e["ruta"] != ruta for _, e in estado.enlaces):
        estado.enlaces.append((estado.turno, {"texto": texto, "ruta": ruta}))


def _valor_para_ia(db: Session, paciente: Paciente, especialista: Especialista) -> dict:
    """Cuánto le cuesta al paciente la consulta con ese médico (eps_service), ya escrito."""
    tipo, valor = eps_service.cobro(db, paciente, especialista)
    cobro = {
        "eps": f"copago de su EPS ({paciente.eps.nombre if paciente.eps else ''})",
        "aliada": f"copago de EPS aliada ({especialista.eps.nombre if especialista.eps else ''})",
    }.get(tipo, "consulta particular")
    return {"valor_consulta": pesos(valor), "cobro": cobro}


def _franja_para_ia(d: Disponibilidad) -> dict:
    return {
        "especialidad": d.especialista.especialidad.nombre,
        "profesional": d.especialista.nombre,
        "eps_del_medico": d.especialista.eps.nombre if d.especialista.eps else "Particular (sin EPS)",
        "sede": d.sede.nombre,
        "ciudad": d.sede.ciudad,
        "modalidad": d.modalidad.value,
        "fecha": d.fecha.isoformat(),
        "dia": DIAS_SEMANA[d.fecha.weekday()],
        "hora": d.hora.strftime("%H:%M"),
    }


def _horario_para_ia(db: Session, paciente: Paciente, d: Disponibilidad) -> dict:
    return {"disponibilidad_id": str(d.id), **_franja_para_ia(d), **_valor_para_ia(db, paciente, d.especialista)}


def _pago_de(cita: Cita) -> str | None:
    if pagos_service.pago_aprobado(cita):
        return "pagada"
    return "pendiente de pago" if pagos_service.esta_pendiente(cita) else None


def _cita_para_ia(cita: Cita) -> dict:
    return {
        "numero_comprobante": cita.numero_comprobante,
        **_franja_para_ia(cita.disponibilidad),
        "recordatorio_por": cita.canal_recordatorio.value,
        "estado": citas_service.ESTADOS_VISIBLES[citas_service.estado_visible(cita)],
        "valor_consulta": pesos(cita.valor),
        "cobro": pagos_service.concepto(cita),
        "pago": _pago_de(cita),
    }


def _registrar_ofrecidos(
    db: Session, paciente: Paciente, estado: EstadoConversacion, horarios: list[Disponibilidad]
) -> None:
    for h in horarios:
        estado.horarios_ofrecidos[h.id] = _HorarioOfrecido(
            datetime.combine(h.fecha, h.hora),
            {**_franja_para_ia(h), **_valor_para_ia(db, paciente, h.especialista)},
            h.especialista.especialidad_id,
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
    todas = especialidad_repository.listar_con_medicos(db)
    resultado = {"especialidades": [e["nombre"] for e in todas if e["medicos"]]}
    if sin_medicos := [e["nombre"] for e in todas if not e["medicos"]]:
        resultado["sin_medicos_por_ahora"] = sin_medicos
        resultado["nota"] = (
            "Las especialidades sin médicos por ahora no se pueden agendar. Si el paciente pide una, "
            "díselo con claridad y ofrécele solicitar una petición (ofrecer_enlace, destino peticion)."
        )
    return resultado


def _buscar_sedes(db: Session, _p: Paciente, _e: EstadoConversacion, _a: dict) -> dict:
    return {
        "sedes": [
            {"nombre": s.nombre, "ciudad": s.ciudad, **({"direccion": s.direccion} if s.direccion else {})}
            for s in sede_repository.listar_sedes(db)
        ]
    }


class _BuscarHorariosArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    especialidad: str | None = Field(default=None, max_length=80)
    sede: str | None = Field(default=None, max_length=100)
    ciudad: str | None = Field(default=None, max_length=80)
    fecha: date | None = None
    modalidad: Modalidad | None = None
    incluir_particulares: bool | None = None

    @field_validator("especialidad", "sede", "ciudad")
    @classmethod
    def _vacio_es_none(cls, valor: str | None) -> str | None:
        return valor if valor and valor.strip() else None


def _sin_medicos(especialidad: Especialidad) -> dict | None:
    """Si nadie la atiende por ahora, la respuesta para el modelo (con qué ofrecer en su lugar)."""
    if any(e.activo for e in especialidad.especialistas):
        return None
    return {
        "total": 0,
        "horarios": [],
        "nota": (
            f"Por el momento no hay médicos de {especialidad.nombre} en SaludYA. Díselo con claridad "
            "y ofrécele solicitar una petición (ofrecer_enlace, destino peticion, con la especialidad)."
        ),
    }


def _resolver_lugar(db: Session, filtros: _BuscarHorariosArgs) -> tuple[Sede | None, str | None]:
    """La sede y la ciudad que pidió, resueltas contra el catálogo (y que no se contradigan)."""
    sedes = sede_repository.listar_sedes(db)
    sede = _resolver(filtros.sede, sedes, lambda s: s.nombre, "sedes") if filtros.sede else None
    ciudad = None
    if filtros.ciudad:
        ciudad = _resolver(filtros.ciudad, sorted({s.ciudad for s in sedes}), lambda c: c, "ciudades")
        if sede is not None and sede.ciudad != ciudad:
            raise _ErrorParaElModelo(
                f"La {sede.nombre} queda en {sede.ciudad}, no en {ciudad}. Pregúntale al paciente cuál prefiere."
            )
    return sede, ciudad


def _nota_de_particulares(db: Session, consulta: dict) -> dict:
    """Que el modelo sepa que existen particulares, para ofrecerlos solo si hacen falta."""
    con_particulares = disponibilidad_repository.buscar_disponibilidad(
        db, **consulta, eps_ids=set(), incluir_particulares=True
    )
    if not con_particulares:
        return {}
    return {
        "horarios_con_particulares": len(con_particulares),
        "nota_particulares": (
            f"Además hay {len(con_particulares)} horarios con médicos particulares (consulta particular de "
            f"{pesos(eps_service.TARIFAS['particular'])}). Ofrécelos solo si el paciente los pide o si no hay "
            "horarios con su EPS, y dile que cuestan más; para verlos, usa incluir_particulares."
        ),
    }


def _buscar_horarios(
    db: Session, paciente: Paciente, estado: EstadoConversacion, args: dict
) -> dict:
    filtros = _validar(_BuscarHorariosArgs, args, "buscar_horarios")
    # Solo médicos de su EPS o de una aliada (a un particular, cualquiera): Eli no ofrece lo que no
    # puede agendar. Los particulares (cuestan más), solo si el paciente los pide.
    eps_ids = eps_service.eps_permitidas(db, paciente)
    particulares = bool(filtros.incluir_particulares)

    especialidad = None
    if filtros.especialidad:
        especialidad = _resolver(
            filtros.especialidad,
            especialidad_repository.listar_especialidades(db),
            lambda e: e.nombre,
            "especialidades",
        )
        if (sin_medicos := _sin_medicos(especialidad)) is not None:
            return sin_medicos

    sede, ciudad = _resolver_lugar(db, filtros)
    if filtros.fecha is not None and filtros.fecha < hoy_en_colombia():
        raise _ErrorParaElModelo(f"La fecha {filtros.fecha.isoformat()} ya pasó.")

    # El repositorio ya devuelve solo franjas libres que todavía no empiezan.
    especialidad_id = especialidad.id if especialidad else None
    consulta = {
        "especialidad_id": especialidad_id,
        "ciudad": ciudad,
        "sede_id": sede.id if sede else None,
        "modalidad": filtros.modalidad,
        "fecha": filtros.fecha,
    }
    horarios = disponibilidad_repository.buscar_disponibilidad(
        db, **consulta, eps_ids=eps_ids, incluir_particulares=particulares
    )
    mostrados = horarios[:_MAX_HORARIOS]
    resultado = {"total": len(horarios), "horarios": [_horario_para_ia(db, paciente, h) for h in mostrados]}
    if len(horarios) > _MAX_HORARIOS:
        resultado["nota"] = f"Se muestran los primeros {_MAX_HORARIOS} de {len(horarios)}."
    if eps_ids is not None and not particulares:
        resultado |= _nota_de_particulares(db, consulta)

    # Sin cupo con todos los filtros: en vez de solo decir "no hay", se
    # ofrecen los horarios más cercanos de la misma especialidad en
    # cualquier sede, fecha o modalidad (la IA no debe negar una cita
    # si hay disponibilidad en otra parte).
    hubo_otros_filtros = any([sede, ciudad, filtros.fecha, filtros.modalidad])
    if not horarios and hubo_otros_filtros:
        alternativas = disponibilidad_repository.buscar_disponibilidad(
            db, especialidad_id=especialidad_id, eps_ids=eps_ids, incluir_particulares=particulares
        )[:_MAX_ALTERNATIVAS]
        mostrados = alternativas
        resultado["alternativas"] = [_horario_para_ia(db, paciente, h) for h in alternativas]
        resultado["nota"] = (
            "No hay horarios con todos esos filtros. Las alternativas son los más cercanos "
            "de la misma especialidad; ofrécelas sin agendar ninguna hasta que el paciente elija."
        )

    _registrar_ofrecidos(db, paciente, estado, mostrados)
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
        estado.propuesta = {**ofrecido.resumen, "especialidad_id": ofrecido.especialidad_id}
        estado.propuesta_turno = estado.turno
        return pendiente

    # --- La misma lógica que POST /citas (HU-16 + HU-17) ---
    # confirmar_cita bloquea la fila y verifica que el horario siga libre.
    try:
        cita = citas_service.confirmar_cita(
            db, paciente.id, datos.disponibilidad_id, datos.canal_recordatorio,
            actor=_actor(paciente),
        )
    except MedicoDeOtraEpsError as e:
        db.rollback()
        raise _ErrorParaElModelo(f"{e} Busca otro horario y ofréceselo al paciente.")
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
        MedicoDeOtraEpsError,
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


# --- Valores, peticiones, lista de espera y botones a otras pantallas ---


def _nombres_aliadas(db: Session, eps_id: uuid.UUID) -> list[str]:
    return sorted(e.nombre for e in db.query(Eps).filter(Eps.id.in_(eps_service.aliadas_de(db, eps_id))))


def _valores_segun_el_medico(db: Session, paciente: Paciente) -> list[dict]:
    tarifas = eps_service.TARIFAS
    particular = {"con": "Médicos particulares (sin EPS)", "valor": pesos(tarifas["particular"]),
                  "concepto": "consulta particular"}
    if paciente.eps is None:
        return [particular | {"con": "Cualquier médico de SaludYA (usted no tiene EPS registrada)"}]
    valores = [{"con": f"Médicos de su EPS ({paciente.eps.nombre})", "valor": pesos(tarifas["eps"]),
                "concepto": "copago"}]
    if aliadas := _nombres_aliadas(db, paciente.eps_id):
        valores.append({"con": f"Médicos de EPS aliadas a la suya ({', '.join(aliadas)})",
                        "valor": pesos(tarifas["aliada"]), "concepto": "copago"})
    return [*valores, particular]


def _eps_de_la_red(db: Session) -> list[dict]:
    """Qué EPS tienen médicos en SaludYA, cuántos y con cuáles comparten: para comparar sin recomendar ninguna."""
    por_eps = (
        db.query(Eps, func.count(Especialista.id))
        .join(Especialista, Especialista.eps_id == Eps.id)
        .filter(Especialista.activo.is_(True))
        .group_by(Eps.id)
        .order_by(Eps.nombre)
        .all()
    )
    red = []
    for eps, medicos in por_eps:
        aliadas = _nombres_aliadas(db, eps.id)
        red.append({"eps": eps.nombre, "medicos": medicos, **({"comparte_medicos_con": aliadas} if aliadas else {})})
    return red


def _consultar_valores(db: Session, paciente: Paciente, _e: EstadoConversacion, _a: dict) -> dict:
    """Cuánto vale la consulta según el médico (eps_service.TARIFAS) y cómo se paga."""
    tarifas = eps_service.TARIFAS
    valores = _valores_segun_el_medico(db, paciente)
    eps_de_la_red = _eps_de_la_red(db)
    particulares = db.query(func.count(Especialista.id)).filter(
        Especialista.activo.is_(True), Especialista.eps_id.is_(None)
    ).scalar()
    pendientes = [c for c in cita_repository.listar_por_paciente(db, paciente.id) if pagos_service.esta_pendiente(c)]
    resultado = {
        "su_eps": paciente.eps.nombre if paciente.eps else None,
        "valores": valores,
        "reglas": [
            "El valor es el mismo para todas las especialidades y para todas las EPS: con los médicos de "
            f"la propia EPS siempre es un copago de {pesos(tarifas['eps'])}.",
            "La EPS del paciente es la que registró al crear su cuenta. SaludYA no recomienda ninguna EPS.",
            "Con médicos de otras EPS que no son aliadas de la del paciente no se puede agendar.",
            "El valor queda fijo al agendar y aparece en el comprobante.",
            "La consulta se paga después de la cita: en línea desde 'Mis citas' (PSE o tarjeta) o en la sede.",
            "Una cita cancelada no se paga.",
        ],
        "eps_con_medicos_en_saludya": eps_de_la_red,
        "medicos_particulares": particulares,
        "pagos_pendientes": [
            {"numero_comprobante": c.numero_comprobante, "especialidad": c.disponibilidad.especialista.especialidad.nombre,
             "fecha": c.disponibilidad.fecha.isoformat(), "valor": pesos(c.valor)}
            for c in pendientes[:_MAX_CITAS]
        ],
    }
    if pendientes:
        resultado["nota"] = "Para pagar, ofrécele el botón con ofrecer_enlace (destino pagar_cita y su comprobante)."
    return resultado


def _consultar_peticiones(db: Session, paciente: Paciente, estado: EstadoConversacion, _a: dict) -> dict:
    """HU-77: sus peticiones de cita y derechos de petición, con su estado (de la más reciente a la más antigua)."""
    solicitudes = solicitud_cita_repository.del_paciente(db, paciente.id)
    if not solicitudes:
        return {"total": 0, "peticiones": [],
                "nota": "No ha radicado peticiones. Si necesita una, ofrécele el botón (ofrecer_enlace, destino peticion)."}
    _agregar_enlace(estado, *DESTINOS["mis_peticiones"])
    peticiones = []
    for s in solicitudes[:_MAX_CITAS]:
        cita = s.cita
        peticiones.append({
            "numero_radicado": s.numero_radicado,
            "tipo": TIPO_PETICION[s.tipo],
            "especialidad": s.especialidad.nombre,
            "estado": ESTADO_PETICION[s.estado],
            "radicada_el": s.radicada_en.astimezone(ZONA_COLOMBIA).date().isoformat(),
            "fecha_que_pidio": s.fecha_deseada.isoformat(),
            # La respuesta del personal puede traer datos médicos (va cifrada): no se le manda al
            # modelo. El paciente la lee en la pantalla de peticiones (el botón de abajo).
            "tiene_respuesta_escrita": bool(s.respuesta),
            "cita_asignada": {
                "numero_comprobante": cita.numero_comprobante,
                "profesional": cita.disponibilidad.especialista.nombre,
                "sede": cita.disponibilidad.sede.nombre,
                "fecha": cita.disponibilidad.fecha.isoformat(),
                "hora": cita.disponibilidad.hora.strftime("%H:%M"),
            } if cita else None,
        })
    resultado = {"total": len(solicitudes), "peticiones": peticiones}
    if len(solicitudes) > _MAX_CITAS:
        resultado["nota"] = f"Se muestran las {_MAX_CITAS} más recientes de {len(solicitudes)}."
    return resultado


def _consultar_lista_espera(db: Session, paciente: Paciente, estado: EstadoConversacion, _a: dict) -> dict:
    """HU-19 y HU-31: en qué listas de espera está, en qué puesto y si tiene un cupo reservado."""
    activas = [
        s for s in lista_espera_service.mis_solicitudes(db, paciente)
        if s["estado"] in (EstadoSolicitud.EN_ESPERA, EstadoSolicitud.CUPO_OFRECIDO)
    ]
    if not activas:
        return {"total": 0, "listas": [],
                "nota": "No está en ninguna lista de espera. Puedes inscribirlo con unirse_lista_espera si lo pide."}
    _agregar_enlace(estado, *DESTINOS["mi_lista_espera"])
    listas = []
    for s in activas:
        oferta = s["oferta"]
        listas.append({
            "especialidad": s["especialidad"],
            "puesto": s["posicion"],
            "personas_en_la_lista": s["total_en_lista"],
            "sedes": s["sedes"],
            "horario_preferido": JORNADA[s["jornada"]],
            "cupo_reservado": {
                "profesional": oferta["especialista"],
                "sede": oferta["sede"],
                "fecha": oferta["fecha"].isoformat(),
                "hora": oferta["hora"].strftime("%H:%M"),
                "reservado_hasta": oferta["expira_en"].astimezone(ZONA_COLOMBIA).strftime("%Y-%m-%d %H:%M"),
            } if oferta else None,
        })
    resultado = {"total": len(listas), "listas": listas}
    if any(lista["cupo_reservado"] for lista in listas):
        resultado["nota"] = (
            "Tiene un cupo reservado: se acepta o se rechaza en la pantalla de la lista de espera. "
            "Debajo de tu mensaje ya aparece el botón para ir allí."
        )
    return resultado


class _UnirseListaArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    especialidad: str = Field(min_length=1, max_length=80)
    sede: str | None = Field(default=None, max_length=100)
    jornada: Jornada
    modalidad: Modalidad | None = None
    canal: CanalContacto


def _unirse_lista_espera(db: Session, paciente: Paciente, estado: EstadoConversacion, args: dict) -> dict:
    """HU-19: lo inscribe en la lista de espera, con confirmación (como al agendar)."""
    datos = _validar(_UnirseListaArgs, args, "unirse_lista_espera")
    especialidad = _resolver(
        datos.especialidad, especialidad_repository.listar_especialidades(db), lambda e: e.nombre, "especialidades"
    )
    # Como en la pantalla: solo donde atienden médicos de su EPS o de una aliada (no particulares).
    permitidas = eps_service.eps_permitidas(db, paciente)
    medicos = [
        e for e in especialista_repository.listar_especialistas(db, especialidad.id)
        if permitidas is None or e.eps_id in permitidas
    ]
    sedes = sorted({s.id: s for e in medicos for s in e.sedes if s.activa}.values(), key=lambda s: s.nombre)
    if not sedes:
        de_su_eps = " que atiendan a afiliados de su EPS" if permitidas is not None else ""
        raise _ErrorParaElModelo(
            f"Por el momento no hay médicos de {especialidad.nombre}{de_su_eps}: no se puede inscribir en la "
            "lista de espera. Ofrécele solicitar una petición (ofrecer_enlace, destino peticion)."
        )
    if datos.sede:
        sedes = [_resolver(datos.sede, sedes, lambda s: s.nombre, f"sedes donde atiende {especialidad.nombre}")]
    if lista_espera_repository.activa_de(db, paciente.id, especialidad.id):
        raise _ErrorParaElModelo(
            f"El paciente ya está en la lista de espera de {especialidad.nombre}. Usa consultar_lista_espera."
        )

    pendiente = _pedir_confirmacion(
        estado,
        ("lista_espera", especialidad.id, tuple(s.id for s in sedes), datos.jornada, datos.modalidad, datos.canal),
        {
            "resumen": {
                "especialidad": especialidad.nombre,
                "sedes": [s.nombre for s in sedes],
                "horario_preferido": JORNADA[datos.jornada],
                "modalidad": datos.modalidad.value if datos.modalidad else "presencial o virtual",
                "aviso_por": datos.canal.value,
            },
            "instruccion": (
                "Todavía NO está inscrito. Muéstrale este resumen y pregúntale si confirma. Solo si dice "
                "que sí, vuelve a llamar unirse_lista_espera con los mismos datos."
            ),
        },
    )
    if pendiente is not None:
        return pendiente

    try:
        solicitud = lista_espera_service.unirse(
            db, paciente, especialidad.id, [s.id for s in sedes], datos.jornada, datos.modalidad, datos.canal
        )
    except ListaEsperaInvalidaError as e:
        raise _ErrorParaElModelo(str(e))
    salida = lista_espera_service.solicitud_out(db, solicitud)
    _agregar_enlace(estado, *DESTINOS["mi_lista_espera"])
    oferta = salida["oferta"]
    return {
        "mensaje": "Quedó inscrito en la lista de espera.",
        "especialidad": especialidad.nombre,
        "puesto": salida["posicion"],
        "personas_en_la_lista": salida["total_en_lista"],
        "aviso_por": datos.canal.value,
        "cupo_reservado": {
            "profesional": oferta["especialista"],
            "sede": oferta["sede"],
            "fecha": oferta["fecha"].isoformat(),
            "hora": oferta["hora"].strftime("%H:%M"),
            "reservado_hasta": oferta["expira_en"].astimezone(ZONA_COLOMBIA).strftime("%Y-%m-%d %H:%M"),
        } if oferta else None,
    }


class _EnlaceArgs(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    destino: Literal[
        "agendar", "mis_citas", "formula", "peticion", "derecho_de_peticion",
        "mis_peticiones", "lista_espera", "mi_lista_espera", "pagar_cita",
    ]
    especialidad: str | None = Field(default=None, max_length=80)
    numero_comprobante: str | None = Field(default=None, max_length=20)


def _ofrecer_enlace(db: Session, paciente: Paciente, estado: EstadoConversacion, args: dict) -> dict:
    """Un botón debajo del mensaje que lleva a la pantalla de ese trámite (la ruta la arma el backend)."""
    datos = _validar(_EnlaceArgs, args, "ofrecer_enlace")
    if datos.destino == "pagar_cita":
        if not datos.numero_comprobante:
            raise _ErrorParaElModelo("Para pagar hace falta el número de comprobante de la cita (consultar_valores).")
        cita = _cita_por_numero(db, paciente, datos.numero_comprobante)
        if not pagos_service.esta_pendiente(cita):
            raise _ErrorParaElModelo("Esa cita no tiene un pago pendiente.")
        texto, ruta = f"Pagar {pesos(cita.valor)}", f"/pagar/{cita.id}"
    else:
        texto, ruta = DESTINOS[datos.destino]
        if datos.especialidad and datos.destino in _CON_ESPECIALIDAD:
            especialidad = _resolver(
                datos.especialidad, especialidad_repository.listar_especialidades(db), lambda e: e.nombre,
                "especialidades",
            )
            ruta = f"{ruta}{'&' if '?' in ruta else '?'}especialidad={especialidad.id}"
    _agregar_enlace(estado, texto, ruta)
    return {
        "boton": texto,
        "instruccion": f"Debajo de tu mensaje el paciente verá el botón «{texto}». Dile en una frase qué hará allí.",
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
    "consultar_valores": _consultar_valores,
    "consultar_peticiones": _consultar_peticiones,
    "consultar_lista_espera": _consultar_lista_espera,
    "unirse_lista_espera": _unirse_lista_espera,
    "ofrecer_enlace": _ofrecer_enlace,
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
