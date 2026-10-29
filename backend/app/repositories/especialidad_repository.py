"""Acceso a datos del catálogo de Especialidades — HU-09."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.especialidad import Especialidad
from app.models.especialista import Especialista


def listar_especialidades(db: Session) -> list[Especialidad]:
    return db.query(Especialidad).order_by(Especialidad.nombre).all()


def listar_con_medicos(db: Session) -> list[dict]:
    """Cada especialidad con cuántos médicos activos tiene (0 = por el momento nadie la atiende)."""
    filas = (
        db.query(Especialidad, func.count(Especialista.id))
        .outerjoin(Especialista, (Especialista.especialidad_id == Especialidad.id) & Especialista.activo.is_(True))
        .group_by(Especialidad.id)
        .order_by(Especialidad.nombre)
        .all()
    )
    return [{"id": e.id, "nombre": e.nombre, "medicos": medicos} for e, medicos in filas]


def obtener_por_id(db: Session, especialidad_id) -> Especialidad | None:
    return db.get(Especialidad, especialidad_id)
