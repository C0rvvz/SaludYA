"""Acceso a datos de la auditoría — HU-80 a HU-85 (solo lectura: se escribe desde auditoria_service)."""

import uuid

from sqlalchemy.orm import Session

from app.models.auditoria import RegistroAuditoria


def listar(
    db: Session,
    cita_id: uuid.UUID | None = None,
    paciente_id: uuid.UUID | None = None,
    acciones: list[str] | None = None,
    limite: int = 200,
) -> list[RegistroAuditoria]:
    """De lo más reciente a lo más antiguo (HU-80: orden cronológico)."""
    query = db.query(RegistroAuditoria)
    if cita_id is not None:
        query = query.filter(RegistroAuditoria.cita_id == cita_id)
    if paciente_id is not None:
        query = query.filter(RegistroAuditoria.paciente_id == paciente_id)
    if acciones:
        query = query.filter(RegistroAuditoria.accion.in_(acciones))
    return query.order_by(RegistroAuditoria.fecha.desc()).limit(limite).all()
