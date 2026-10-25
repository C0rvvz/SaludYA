"""Acceso a datos del catálogo de Sedes — HU-13."""

from sqlalchemy.orm import Session

from app.models.sede import Sede


def listar_sedes(db: Session, solo_activas: bool = True) -> list[Sede]:
    """Las que atienden (las cerradas no se ofrecen); con solo_activas=False, todas (panel del personal)."""
    query = db.query(Sede)
    if solo_activas:
        query = query.filter(Sede.activa.is_(True))
    return query.order_by(Sede.nombre).all()


def por_ids(db: Session, sede_ids) -> list[Sede]:
    return db.query(Sede).filter(Sede.id.in_(sede_ids)).all() if sede_ids else []
