"""Acceso a datos de Cita — HU-16, HU-17."""

import uuid

from sqlalchemy.orm import Session, joinedload

from app.models.cita import Cita
from app.models.disponibilidad import Disponibilidad
from app.models.especialista import Especialista


def crear_cita(db: Session, cita: Cita) -> Cita:
    db.add(cita)
    db.commit()
    db.refresh(cita)
    return cita


def obtener_por_id(db: Session, cita_id: uuid.UUID) -> Cita | None:
    return (
        db.query(Cita)
        .options(
            joinedload(Cita.paciente),
            joinedload(Cita.disponibilidad)
            .joinedload(Disponibilidad.especialista)
            .joinedload(Especialista.especialidad),
            joinedload(Cita.disponibilidad).joinedload(Disponibilidad.sede),
        )
        .filter(Cita.id == cita_id)
        .first()
    )
