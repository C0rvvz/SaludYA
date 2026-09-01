"""Acceso a datos de Cita — HU-16."""

from sqlalchemy.orm import Session

from app.models.cita import Cita


def crear_cita(db: Session, cita: Cita) -> Cita:
    db.add(cita)
    db.commit()
    db.refresh(cita)
    return cita
