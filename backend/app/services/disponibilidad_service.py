"""
Generación de franjas de disponibilidad.

La migración 68c2843c218e siembra franjas solo para los 5 días hábiles
siguientes a cuando se EJECUTÓ; pasados esos días ya no queda ninguna
futura y el inicio y la búsqueda dejan de mostrar especialistas. Aquí
se generan tandas nuevas para los especialistas que ya existen:

- generar_franjas(): la usa el script generar_disponibilidad.
- reponer_si_se_agoto(): la llama la tarea de fondo (ver
  tareas_periodicas.py). Cuando ya no queda ninguna franja de mañana
  en adelante -- es decir, pasaron los días de la tanda anterior --,
  genera otra de DIAS_POR_TANDA días hábiles.

Las franjas que ya existen se omiten, así que ninguna de las dos
duplica datos ni toca las franjas pasadas o sus citas.
"""

from dataclasses import dataclass
from datetime import date, time, timedelta
from itertools import product

from sqlalchemy.orm import Session

from app.models.disponibilidad import EstadoDisponibilidad
from app.repositories import disponibilidad_repository, especialista_repository
from app.utils.tiempo import hoy_en_colombia

DIAS_POR_TANDA = 10

# Las mismas horas que usa la migración de siembra; la de las 8:00 queda
# "reservada" a propósito, igual que allí, para demostrar HU-10 (criterio 3).
HORAS_DEL_DIA = [time(8, 0), time(10, 0), time(15, 0)]


@dataclass(frozen=True)
class Tanda:
    creadas: int
    omitidas: int
    desde: date
    hasta: date


def _proximos_dias_habiles(n: int) -> list[date]:
    dias = []
    cursor = hoy_en_colombia() + timedelta(days=1)
    while len(dias) < n:
        if cursor.weekday() < 5:  # 0=lunes ... 4=viernes
            dias.append(cursor)
        cursor += timedelta(days=1)
    return dias


def generar_franjas(db: Session, dias: int = DIAS_POR_TANDA) -> Tanda:
    """
    Una franja por cada combinación de sede que atiende cada especialista
    + modalidad que ofrece, en los próximos `dias` días hábiles (desde
    mañana), a las horas de HORAS_DEL_DIA.
    """
    dias_habiles = _proximos_dias_habiles(dias)

    filas = []
    for especialista in especialista_repository.listar_especialistas(db):
        modalidades = especialista_repository.obtener_modalidades(db, especialista.id)
        combinaciones = product(especialista.sedes, modalidades, dias_habiles, HORAS_DEL_DIA)
        filas += [
            {
                "especialista_id": especialista.id,
                "sede_id": sede.id,
                "modalidad": modalidad,
                "fecha": dia,
                "hora": hora,
                "estado": EstadoDisponibilidad.RESERVADO if hora == HORAS_DEL_DIA[0] else EstadoDisponibilidad.DISPONIBLE,
            }
            for sede, modalidad, dia, hora in combinaciones
        ]

    creadas = disponibilidad_repository.insertar_franjas(db, filas) if filas else 0
    return Tanda(creadas, len(filas) - creadas, dias_habiles[0], dias_habiles[-1])


def reponer_si_se_agoto(db: Session) -> Tanda | None:
    """Genera otra tanda solo si ya no queda ninguna franja de mañana en adelante."""
    if disponibilidad_repository.hay_franjas_despues_de(db, hoy_en_colombia()):
        return None
    return generar_franjas(db, DIAS_POR_TANDA)
