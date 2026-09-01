"""Acceso a datos del catálogo de Sedes — HU-13."""

from sqlalchemy.orm import Session

from app.models.sede import Sede


def listar_sedes(db: Session) -> list[Sede]:
    return db.query(Sede).order_by(Sede.nombre).all()
