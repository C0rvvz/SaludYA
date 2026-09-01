"""
Acceso a datos de códigos OTP — HU-02, HU-03, HU-04.
"""

import uuid

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.codigo_otp import CodigoOTP, EstadoOTP


def obtener_ultimo_otp(db: Session, paciente_id: uuid.UUID) -> CodigoOTP | None:
    return (
        db.query(CodigoOTP)
        .filter(CodigoOTP.paciente_id == paciente_id)
        .order_by(desc(CodigoOTP.creado_en))
        .first()
    )


def invalidar_pendientes(db: Session, paciente_id: uuid.UUID) -> None:
    db.query(CodigoOTP).filter(
        CodigoOTP.paciente_id == paciente_id,
        CodigoOTP.estado == EstadoOTP.PENDIENTE,
    ).update({"estado": EstadoOTP.INVALIDADO})
    db.commit()


def crear_otp(db: Session, otp: CodigoOTP) -> CodigoOTP:
    db.add(otp)
    db.commit()
    db.refresh(otp)
    return otp
