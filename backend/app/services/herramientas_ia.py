"""
Ejecución de las funciones (tools) que pide el modelo — HU-33.

El modelo solo PIDE ejecutar una función; aquí se decide si se hace.
Los argumentos llegan tal como los escribió el modelo y se tratan
como entrada no confiable: se validan con Pydantic, los nombres
("Dermatología", "Medellin", "Laureles") se resuelven contra el
catálogo real, y cualquier problema se le devuelve al modelo como un
error en texto para que le pregunte al paciente, nunca como una
excepción que rompa la conversación.

No se escribe ninguna consulta nueva: todo pasa por los repositorios
y servicios que ya usan los endpoints del Sprint 1.
"""

import json
import unicodedata
from collections.abc import Callable
from datetime import date, datetime
from typing import TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from app.models.disponibilidad import Disponibilidad
from app.models.especialista import Modalidad
from app.models.paciente import Paciente
from app.repositories import disponibilidad_repository, especialidad_repository, sede_repository
from app.services import ia

# Tope de resultados por búsqueda: la lista completa podría tener
# cientos de franjas, y todo lo que se devuelve viaja al modelo.
_MAX_HORARIOS = 8
_MAX_ALTERNATIVAS = 5

T = TypeVar("T")


class _ErrorParaElModelo(Exception):
    """Algo que el modelo debe corregir o preguntarle al paciente."""


def _error(mensaje: str) -> dict:
    return {"error": mensaje}


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


def _horario_para_ia(d: Disponibilidad) -> dict:
    return {
        "disponibilidad_id": str(d.id),
        "especialidad": d.especialista.especialidad.nombre,
        "profesional": d.especialista.nombre,
        "sede": d.sede.nombre,
        "ciudad": d.sede.ciudad,
        "modalidad": d.modalidad.value,
        "fecha": d.fecha.isoformat(),
        "dia": ia.DIAS_SEMANA[d.fecha.weekday()],
        "hora": d.hora.strftime("%H:%M"),
    }


# --- Solo lectura: catálogo (HU-09, HU-10, HU-11, HU-13, HU-14) ---


def _buscar_especialidades(db: Session, _paciente: Paciente, _args: dict) -> dict:
    return {"especialidades": [e.nombre for e in especialidad_repository.listar_especialidades(db)]}


def _buscar_sedes(db: Session, _paciente: Paciente, _args: dict) -> dict:
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


def _buscar_horarios(db: Session, _paciente: Paciente, args: dict) -> dict:
    try:
        filtros = _BuscarHorariosArgs.model_validate(args)
    except ValidationError as e:
        raise _ErrorParaElModelo(f"Parámetros inválidos para buscar_horarios: {e.errors()[0]['msg']}")

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
    resultado = {
        "total": len(horarios),
        "horarios": [_horario_para_ia(h) for h in horarios[:_MAX_HORARIOS]],
    }
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
        )
        resultado["alternativas"] = [_horario_para_ia(h) for h in alternativas[:_MAX_ALTERNATIVAS]]
        resultado["nota"] = (
            "No hay horarios con todos esos filtros. Las alternativas son los más cercanos "
            "de la misma especialidad; ofrécelas sin agendar ninguna hasta que el paciente elija."
        )

    return resultado


def _futuros(horarios: list[Disponibilidad]) -> list[Disponibilidad]:
    # El repositorio filtra por fecha >= hoy, pero no descarta las horas
    # que ya pasaron hoy; el asistente no debe ofrecer una cita a las
    # 10:00 si ya son las 15:00.
    ahora = datetime.now(ia.ZONA_COLOMBIA).replace(tzinfo=None)
    return [h for h in horarios if datetime.combine(h.fecha, h.hora) > ahora]


_Manejador = Callable[[Session, Paciente, dict], dict]

_MANEJADORES: dict[str, _Manejador] = {
    "buscar_especialidades": _buscar_especialidades,
    "buscar_sedes": _buscar_sedes,
    "buscar_horarios": _buscar_horarios,
}


def ejecutar(db: Session, paciente: Paciente, nombre: str, argumentos_json: str | None) -> dict:
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
        return manejador(db, paciente, args)
    except _ErrorParaElModelo as e:
        return _error(str(e))
