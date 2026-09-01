"""
Acceso a datos del catálogo de EPS.
"""

import uuid

from sqlalchemy.orm import Session

from app.models.eps import Eps


def listar_eps(db: Session) -> list[Eps]:
    return db.query(Eps).order_by(Eps.nombre).all()


def obtener_eps_por_id(db: Session, eps_id: uuid.UUID) -> Eps | None:
    return db.query(Eps).filter(Eps.id == eps_id).first()
