"""Acceso a datos de los recordatorios programados — HU-64 y HU-65."""

import uuid
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.models.recordatorio_programado import EstadoProgramacion, RecordatorioProgramado


def listar(db: Session, limite: int = 200) -> list[RecordatorioProgramado]:
    """Los más recientes primero (por la fecha para la que se programaron)."""
    return (
        db.query(RecordatorioProgramado)
        .options(joinedload(RecordatorioProgramado.paciente), joinedload(RecordatorioProgramado.personal))
        .order_by(RecordatorioProgramado.programado_para.desc())
        .limit(limite)
        .all()
    )


def pendientes(db: Session, hasta: datetime | None = None) -> list[RecordatorioProgramado]:
    """Los que falta enviar; con `hasta`, solo los que ya llegaron a su hora (bloqueados para enviarlos)."""
    query = db.query(RecordatorioProgramado).filter(
        RecordatorioProgramado.estado == EstadoProgramacion.PENDIENTE
    )
    if hasta is not None:
        query = query.filter(RecordatorioProgramado.programado_para <= hasta).with_for_update(skip_locked=True)
    return query.order_by(RecordatorioProgramado.programado_para).all()


def obtener_con_lock(db: Session, programado_id: uuid.UUID) -> RecordatorioProgramado | None:
    """SELECT ... FOR UPDATE: editar, cancelar o reintentar no se cruza con el envío de la tarea de fondo."""
    return (
        db.query(RecordatorioProgramado)
        .filter(RecordatorioProgramado.id == programado_id)
        .with_for_update()
        .first()
    )
