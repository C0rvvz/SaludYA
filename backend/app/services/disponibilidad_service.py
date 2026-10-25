"""
Generación de franjas de disponibilidad a partir del horario semanal
(turnos) de cada especialista — RNF "el aplicativo mantendrá actualizada
la base de datos de los especialistas".

- generar_franjas(): la agenda de los próximos DIAS_POR_TANDA días hábiles
  (desde mañana; los sábados que caigan en medio también, si hay turno),
  una franja por cita de cada turno: "lunes de 7:00 a 12:00, citas de
  30 min" da 7:00, 7:30, ..., 11:30. La usan la tarea de fondo (cada
  pasada mantiene la agenda al día), la actualización de la IPS y el
  script generar_disponibilidad.
- liberar_futuras(): quita las franjas futuras de un especialista que
  nadie ocupa (al cambiar su horario o desactivarlo).

Las franjas que ya existen se omiten, así que nunca se duplican ni se
tocan las pasadas o las que tienen cita. Tampoco se crea una franja si el
especialista ya tiene otra a esa misma hora (en otra sede o modalidad).

SUPUESTO: la IPS también agenda por otros canales (teléfono, ventanilla):
al generar, OCUPACION_SIMULADA de las franjas ya aparecen ocupadas, como
pasa en la realidad. Es reproducible: la misma franja siempre sale igual.
"""

import random
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.models.cita import Cita
from app.models.disponibilidad import Disponibilidad, EstadoDisponibilidad
from app.models.especialista import Especialista
from app.models.lista_espera import OfertaEspera
from app.repositories import disponibilidad_repository
from app.utils.tiempo import hoy_en_colombia

DIAS_POR_TANDA = 10
OCUPACION_SIMULADA = 0.25


@dataclass(frozen=True)
class Tanda:
    creadas: int
    omitidas: int
    desde: date
    hasta: date


def ventana(dias_habiles: int = DIAS_POR_TANDA) -> tuple[date, date]:
    """Desde mañana hasta el día hábil número `dias_habiles` (lunes a viernes)."""
    desde = hoy_en_colombia() + timedelta(days=1)
    cursor, contados = desde, 0
    while True:
        if cursor.weekday() < 5:
            contados += 1
            if contados == dias_habiles:
                return desde, cursor
        cursor += timedelta(days=1)


def _horas(turno, fecha: date):
    inicio = datetime.combine(fecha, turno.hora_inicio)
    fin = datetime.combine(fecha, turno.hora_fin)
    paso = timedelta(minutes=turno.duracion_minutos)
    while inicio + paso <= fin:
        yield inicio.time()
        inicio += paso


def _ocupada(especialista_id: uuid.UUID, fecha: date, hora) -> bool:
    return random.Random(f"{especialista_id}{fecha}{hora}").random() < OCUPACION_SIMULADA


def generar_franjas(
    db: Session, dias: int = DIAS_POR_TANDA, especialistas: list[Especialista] | None = None
) -> Tanda:
    """La agenda de los especialistas activos (o de los indicados) en los próximos `dias` días hábiles."""
    desde, hasta = ventana(dias)
    if especialistas is None:
        especialistas = db.query(Especialista).filter(Especialista.activo.is_(True)).all()
    ids = [e.id for e in especialistas if e.activo]
    # A qué horas ya tiene algo cada especialista (en cualquier sede o modalidad).
    ocupadas = {
        (e, f, h)
        for e, f, h in db.query(Disponibilidad.especialista_id, Disponibilidad.fecha, Disponibilidad.hora)
        .filter(Disponibilidad.especialista_id.in_(ids), Disponibilidad.fecha.between(desde, hasta))
        .all()
    } if ids else set()

    filas = []
    for especialista in especialistas:
        if not especialista.activo:
            continue
        fecha = desde
        while fecha <= hasta:
            for turno in especialista.turnos:
                if turno.dia_semana != fecha.weekday():
                    continue
                for hora in _horas(turno, fecha):
                    clave = (especialista.id, fecha, hora)
                    if clave in ocupadas:
                        continue
                    ocupadas.add(clave)
                    filas.append({
                        "especialista_id": especialista.id,
                        "sede_id": turno.sede_id,
                        "modalidad": turno.modalidad,
                        "fecha": fecha,
                        "hora": hora,
                        "estado": EstadoDisponibilidad.RESERVADO if _ocupada(especialista.id, fecha, hora)
                        else EstadoDisponibilidad.DISPONIBLE,
                    })
            fecha += timedelta(days=1)

    creadas = disponibilidad_repository.insertar_franjas(db, filas) if filas else 0
    return Tanda(creadas, len(filas) - creadas, desde, hasta)


def liberar_futuras(db: Session, especialista_id: uuid.UUID) -> int:
    """
    Quita las franjas de mañana en adelante que nadie ocupa: sin cita y sin
    cupo ofrecido a la lista de espera. Las que tienen cita se conservan.
    Sin commit: se guarda junto con el cambio que la provocó.
    """
    return (
        db.query(Disponibilidad)
        .filter(
            Disponibilidad.especialista_id == especialista_id,
            Disponibilidad.fecha > hoy_en_colombia(),
            ~exists().where(Cita.disponibilidad_id == Disponibilidad.id),
            ~exists().where(OfertaEspera.disponibilidad_id == Disponibilidad.id),
        )
        .delete(synchronize_session=False)
    )
