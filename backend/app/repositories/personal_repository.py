"""Acceso a datos del personal (apartado de administración)."""

import uuid

from sqlalchemy.orm import Session

from app.models.personal import Personal, RolPersonal


def obtener_por_id(db: Session, personal_id: uuid.UUID) -> Personal | None:
    return db.get(Personal, personal_id)


def obtener_por_correo(db: Session, correo: str) -> Personal | None:
    return db.query(Personal).filter(Personal.correo == correo.strip().lower()).first()


def listar(db: Session) -> list[Personal]:
    return db.query(Personal).order_by(Personal.activo.desc(), Personal.nombre).all()


def contar_administradores_activos(db: Session) -> int:
    return (
        db.query(Personal)
        .filter(Personal.rol == RolPersonal.ADMINISTRADOR, Personal.activo.is_(True))
        .count()
    )
