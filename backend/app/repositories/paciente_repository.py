"""
Acceso a datos de Paciente — usado por HU-01 (login), HU-03 (sesión
vía JWT) y HU-05/06/07/08 (registro).
"""

import uuid

from sqlalchemy.orm import Session

from app.models.paciente import Paciente


def obtener_por_numero_documento(db: Session, numero_documento: str) -> Paciente | None:
    return db.query(Paciente).filter(Paciente.numero_documento == numero_documento).first()


def obtener_por_id(db: Session, paciente_id: uuid.UUID) -> Paciente | None:
    return db.query(Paciente).filter(Paciente.id == paciente_id).first()


def crear_paciente(db: Session, paciente: Paciente) -> Paciente:
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente
