"""Acceso a datos del catálogo de Especialidades — HU-09."""

from sqlalchemy.orm import Session

from app.models.especialidad import Especialidad


def listar_especialidades(db: Session) -> list[Especialidad]:
    return db.query(Especialidad).order_by(Especialidad.nombre).all()
