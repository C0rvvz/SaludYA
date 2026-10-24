"""Acceso a datos de los eventos de seguridad (solo lectura: se escriben desde seguridad_service)."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.evento_seguridad import EventoSeguridad


def desde(db: Session, momento: datetime, limite: int = 5000) -> list[EventoSeguridad]:
    """Los del periodo, del más reciente al más antiguo."""
    return (
        db.query(EventoSeguridad)
        .filter(EventoSeguridad.fecha >= momento)
        .order_by(EventoSeguridad.fecha.desc())
        .limit(limite)
        .all()
    )
