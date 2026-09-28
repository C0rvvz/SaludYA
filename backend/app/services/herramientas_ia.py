"""
Ejecución de las funciones (tools) que pide el modelo — HU-33.

El modelo solo PIDE ejecutar una función; aquí se decide si se hace.
Los argumentos llegan tal como los escribió el modelo y se tratan
como entrada no confiable: se validan con Pydantic, los nombres
("Dermatología", "Medellin", "Laureles") se resuelven contra el
catálogo real, y cualquier problema se le devuelve al modelo como un
error en texto para que le pregunte al paciente, nunca como una
excepción que rompa la conversación.

Las escrituras (crear_cita) se validan además contra lo que el backend
recuerda de la conversación (EstadoConversacion), no contra lo que el
modelo dice que pasó: solo se puede agendar un horario que el backend
realmente le mostró al paciente, y solo después de que el paciente
haya respondido.

No se escribe ninguna consulta nueva: todo pasa por los repositorios
y servicios que ya usan los endpoints del Sprint 1.
"""

import json
import unicodedata
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import TypeVar

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
from app.services.exceptions import DisponibilidadNoEncontradaError, HorarioYaNoDisponibleError

# Tope de resultados por búsqueda: la lista completa podría tener
# cientos de franjas, y todo lo que se devuelve viaja al modelo.
_MAX_HORARIOS = 8
# El asistente muestra máximo 3 opciones al paciente; más alternativas
# solo gastarían tokens.
_MAX_ALTERNATIVAS = 3
_MAX_CITAS = 5

T = TypeVar("T")
M = TypeVar("M", bound=BaseModel)


@dataclass
class _HorarioOfrecido:
    inicio: datetime  # fecha + hora de la franja, hora de Colombia
    resumen: dict  # lo que se le mostró al modelo, para armar la confirmación


@dataclass
class _ConfirmacionPendiente:
    canal: CanalContacto
    turno: int  # mensaje del paciente en el que se le mostró el resumen


@dataclass
class EstadoConversacion:
    """
    Lo que el backend recuerda de una conversación para validar las
    escrituras. Vive en memoria junto al historial (chatbot.py), que
    incrementa `turno` con cada mensaje del paciente.
    """

    turno: int = 0
    horarios_ofrecidos: dict[uuid.UUID, _HorarioOfrecido] = field(default_factory=dict)
    # disponibilidad_id -> resumen mostrado y esperando el "sí" del paciente.
    confirmaciones_pendientes: dict[uuid.UUID, _ConfirmacionPendiente] = field(
        default_factory=dict
    )
    # disponibilidad_id -> resumen de la cita, para no agendar dos veces
    # si el modelo repite la llamada.
    citas_creadas: dict[uuid.UUID, dict] = field(default_factory=dict)


class _ErrorParaElModelo(Exception):
    """Algo que el modelo debe corregir o preguntarle al paciente."""


def _error(mensaje: str) -> dict:
    return {"error": mensaje}


def _validar(modelo: type[M], args: dict, funcion: str) -> M:
    try:
        return modelo.model_validate(args)
    except ValidationError as e:
        raise _ErrorParaElModelo(f"Parámetros inválidos para {funcion}: {e.errors()[0]['msg']}")


def _ahora_colombia() -> datetime:
    return datetime.now(ia.ZONA_COLOMBIA).replace(tzinfo=None)


def _normalizar(texto: str) -> str:
    # "Medellín", "medellin " y "MEDELLÍN" deben coincidir.
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return " ".join(sin_tildes.lower().split())


def _resolver(pedido: str, opciones: list[T], nombre_de: Callable[[T], str], que: str) -> T:
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
        "dia": ia.DIAS_SEMANA[d.fecha.weekday()],
        "hora": d.hora.strftime("%H:%M"),
    }


def _horario_para_ia(d: Disponibilidad) -> dict:
    return {"disponibilidad_id": str(d.id), **_franja_para_ia(d)}


def _cita_para_ia(cita: Cita) -> dict:
    return {
        "numero_comprobante": cita.numero_comprobante,
        **_franja_para_ia(cita.disponibilidad),
        "recordatorio_por": cita.canal_recordatorio.value,
        "estado": cita.estado.value,
    }


def _futuros(horarios: list[Disponibilidad]) -> list[Disponibilidad]:
    # El repositorio filtra por fecha >= hoy, pero no descarta las horas
    # que ya pasaron hoy; el asistente no debe ofrecer una cita a las
    # 10:00 si ya son las 15:00.
    ahora = _ahora_colombia()
    return [h for h in horarios if datetime.combine(h.fecha, h.hora) > ahora]


def _registrar_ofrecidos(estado: EstadoConversacion, horarios: list[Disponibilidad]) -> None:
    for h in horarios:
        estado.horarios_ofrecidos[h.id] = _HorarioOfrecido(
            datetime.combine(h.fecha, h.hora), _franja_para_ia(h)
        )


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

    if filtros.fecha is not None and filtros.fecha < ia.hoy_en_colombia():
        raise _ErrorParaElModelo(f"La fecha {filtros.fecha.isoformat()} ya pasó.")

    horarios = _futuros(
        disponibilidad_repository.buscar_disponibilidad(
            db,
            especialidad_id=especialidad_id,
            ciudad=ciudad,
            sede_id=sede.id if sede else None,
            modalidad=filtros.modalidad,
            fecha=filtros.fecha,
        )
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
        alternativas = _futuros(
            disponibilidad_repository.buscar_disponibilidad(db, especialidad_id=especialidad_id)
        )[:_MAX_ALTERNATIVAS]
        mostrados = alternativas
        resultado["alternativas"] = [_horario_para_ia(h) for h in alternativas]
        resultado["nota"] = (
            "No hay horarios con todos esos filtros. Las alternativas son los más cercanos "
            "de la misma especialidad; ofrécelas sin agendar ninguna hasta que el paciente elija."
        )

    _registrar_ofrecidos(estado, mostrados)
    return resultado


# --- Citas del paciente autenticado (HU-16, HU-17, HU-26) ---


class _ConsultarCitaArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    numero_comprobante: str | None = Field(default=None, max_length=20)


def _consultar_cita(db: Session, paciente: Paciente, _e: EstadoConversacion, args: dict) -> dict:
    datos = _validar(_ConsultarCitaArgs, args, "consultar_cita")
    # Siempre filtrado por el paciente del JWT: el modelo no tiene forma
    # de pedir citas de otra persona.
    citas = cita_repository.listar_por_paciente(db, paciente.id)

    if datos.numero_comprobante and datos.numero_comprobante.strip():
        buscado = datos.numero_comprobante.strip().upper()
        citas = [c for c in citas if (c.numero_comprobante or "").upper() == buscado]
        if not citas:
            raise _ErrorParaElModelo(
                f"El paciente no tiene ninguna cita con el número {buscado}."
            )
    else:
        ahora = _ahora_colombia()
        citas = [
            c
            for c in citas
            if datetime.combine(c.disponibilidad.fecha, c.disponibilidad.hora) > ahora
        ]

    resultado = {"total": len(citas), "citas": [_cita_para_ia(c) for c in citas[:_MAX_CITAS]]}
    if len(citas) > _MAX_CITAS:
        resultado["nota"] = f"Se muestran las {_MAX_CITAS} más próximas de {len(citas)}."
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

    # --- Validaciones propias del chat, antes de tocar la base de datos ---
    ofrecido = estado.horarios_ofrecidos.get(datos.disponibilidad_id)
    if ofrecido is None:
        # Un id inventado, o copiado de otro lado: solo se agenda lo que
        # el backend realmente le mostró al paciente en esta conversación.
        raise _ErrorParaElModelo(
            "Ese horario no salió de ninguna búsqueda de esta conversación. "
            "Usa buscar_horarios y deja que el paciente elija."
        )
    if ofrecido.inicio <= _ahora_colombia():
        raise _ErrorParaElModelo("Ese horario ya pasó. Busca otro y ofréceselo al paciente.")

    # --- Confirmación obligatoria, impuesta por el backend ---
    # La primera llamada solo devuelve el resumen. La cita se crea
    # únicamente si el modelo vuelve a pedirla con los mismos datos en
    # un mensaje POSTERIOR del paciente, es decir, después de que el
    # paciente vio el resumen y respondió. Así el modelo no puede
    # agendar por su cuenta en el mismo turno (ni saltarse el "¿confirma?").
    pendiente = estado.confirmaciones_pendientes.get(datos.disponibilidad_id)
    if pendiente is None or pendiente.canal != datos.canal_recordatorio or estado.turno <= pendiente.turno:
        estado.confirmaciones_pendientes[datos.disponibilidad_id] = _ConfirmacionPendiente(
            datos.canal_recordatorio, estado.turno
        )
        return {
            "requiere_confirmacion": True,
            "resumen": {**ofrecido.resumen, "recordatorio_por": datos.canal_recordatorio.value},
            "instruccion": (
                "Todavía NO está agendada. Muéstrale este resumen al paciente y pregúntale si "
                "confirma. Solo si responde que sí, vuelve a llamar crear_cita con los mismos datos."
            ),
        }

    # --- La misma lógica que POST /citas (HU-16 + HU-17) ---
    # confirmar_cita bloquea la fila y verifica que el horario siga libre.
    try:
        cita = citas_service.confirmar_cita(
            db, paciente.id, datos.disponibilidad_id, datos.canal_recordatorio
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
    del estado.confirmaciones_pendientes[datos.disponibilidad_id]
    return {"cita": resumen, "mensaje": "Cita agendada y comprobante generado."}


_Manejador = Callable[[Session, Paciente, EstadoConversacion, dict], dict]

_MANEJADORES: dict[str, _Manejador] = {
    "buscar_especialidades": _buscar_especialidades,
    "buscar_sedes": _buscar_sedes,
    "buscar_horarios": _buscar_horarios,
    "consultar_cita": _consultar_cita,
    "crear_cita": _crear_cita,
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
