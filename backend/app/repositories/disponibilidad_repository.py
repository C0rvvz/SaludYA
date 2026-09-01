"""
Acceso a datos de Disponibilidad — HU-10, HU-11, HU-13, HU-14.

Filtra siempre por estado DISPONIBLE (HU-10, criterio 3: no mostrar
horarios ocupados) y por fecha >= hoy (no tiene sentido ofrecer
franjas pasadas).
"""

import uuid
from datetime import date, time

from sqlalchemy.orm import Session, joinedload

from app.models.disponibilidad import Disponibilidad, EstadoDisponibilidad
from app.models.especialista import Especialista, Modalidad
from app.models.sede import Sede


def listar_disponibilidad(
    db: Session,
    especialista_id: uuid.UUID,
    sede_id: uuid.UUID | None = None,
    modalidad: Modalidad | None = None,
) -> list[Disponibilidad]:
    query = (
        db.query(Disponibilidad)
        .options(joinedload(Disponibilidad.sede))
        .filter(
            Disponibilidad.especialista_id == especialista_id,
            Disponibilidad.estado == EstadoDisponibilidad.DISPONIBLE,
            Disponibilidad.fecha >= date.today(),
        )
    )
    # --- HU-13, criterio 3 / HU-14, criterio 3: la disponibilidad debe
    # corresponder a la sede/modalidad seleccionada, cuando se indique ---
    if sede_id is not None:
        query = query.filter(Disponibilidad.sede_id == sede_id)
    if modalidad is not None:
        query = query.filter(Disponibilidad.modalidad == modalidad)
    return query.order_by(Disponibilidad.fecha, Disponibilidad.hora).all()


def buscar_disponibilidad(
    db: Session,
    especialidad_id: uuid.UUID | None = None,
    ciudad: str | None = None,
    sede_id: uuid.UUID | None = None,
    modalidad: Modalidad | None = None,
    fecha: date | None = None,
    hora: time | None = None,
) -> list[Disponibilidad]:
    """
    Búsqueda combinada a través de TODOS los especialistas -- HU-11.

    Criterio 1 (aplicar filtros): cada parámetro es opcional e
    independiente, se pueden combinar libremente.
    Criterio 2 (actualizar resultados): cada llamada es una consulta
    nueva, no hay estado guardado entre una búsqueda y otra.
    Criterio 3 (solo compatibles): todos los filtros se aplican con AND,
    nunca se devuelve algo que no cumpla TODOS los indicados.
    Criterio 4 (poder modificar filtros): al ser parámetros de query
    independientes, cambiar uno no obliga a repetir los demás.
    """
    query = (
        db.query(Disponibilidad)
        .join(Especialista, Disponibilidad.especialista_id == Especialista.id)
        .join(Sede, Disponibilidad.sede_id == Sede.id)
        .options(
            joinedload(Disponibilidad.especialista).joinedload(Especialista.especialidad),
            joinedload(Disponibilidad.sede),
        )
        .filter(
            Disponibilidad.estado == EstadoDisponibilidad.DISPONIBLE,
            Disponibilidad.fecha >= date.today(),
        )
    )
    if especialidad_id is not None:
        query = query.filter(Especialista.especialidad_id == especialidad_id)
    if ciudad is not None:
        query = query.filter(Sede.ciudad.ilike(ciudad))
    if sede_id is not None:
        query = query.filter(Disponibilidad.sede_id == sede_id)
    if modalidad is not None:
        query = query.filter(Disponibilidad.modalidad == modalidad)
    if fecha is not None:
        query = query.filter(Disponibilidad.fecha == fecha)
    if hora is not None:
        query = query.filter(Disponibilidad.hora == hora)

    return query.order_by(Disponibilidad.fecha, Disponibilidad.hora).all()
