"""Acceso a datos de Cita — HU-16, HU-17, HU-33."""

import uuid

from sqlalchemy.orm import Session, contains_eager, joinedload

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


def listar_por_paciente(db: Session, paciente_id: uuid.UUID) -> list[Cita]:
    """
    Todas las citas de un paciente, de la más próxima a la más lejana.
    La usa el asistente (HU-33, "Ver mis citas"); HU-26/HU-27 pueden
    reutilizarla cuando se implementen.
    """
    return (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .options(
            contains_eager(Cita.disponibilidad)
            .joinedload(Disponibilidad.especialista)
            .joinedload(Especialista.especialidad),
            contains_eager(Cita.disponibilidad).joinedload(Disponibilidad.sede),
        )
        .filter(Cita.paciente_id == paciente_id)
        .order_by(Disponibilidad.fecha, Disponibilidad.hora)
        .all()
    )
