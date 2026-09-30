"""Acceso a datos de las solicitudes de cita (cartas de petición) — HU-76 a HU-79, HU-46, HU-47."""

import uuid
from datetime import datetime

from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from app.models.solicitud_cita import EstadoSolicitudCita, SolicitudCita

# HU-77, criterio 4: las pendientes primero, para identificarlas fácilmente.
_PENDIENTES_PRIMERO = case(
    {EstadoSolicitudCita.PENDIENTE: 0, EstadoSolicitudCita.PENDIENTE_EPS: 1},
    value=SolicitudCita.estado,
    else_=2,
)


def _con_relaciones(db: Session):
    return db.query(SolicitudCita).options(
        joinedload(SolicitudCita.paciente),
        joinedload(SolicitudCita.especialidad),
        joinedload(SolicitudCita.revisor),
        joinedload(SolicitudCita.cita),
    )


def obtener(db: Session, solicitud_id: uuid.UUID) -> SolicitudCita | None:
    return _con_relaciones(db).filter(SolicitudCita.id == solicitud_id).first()


def obtener_con_lock(db: Session, solicitud_id: uuid.UUID) -> SolicitudCita | None:
    return db.query(SolicitudCita).filter(SolicitudCita.id == solicitud_id).with_for_update().first()


def del_paciente(db: Session, paciente_id: uuid.UUID) -> list[SolicitudCita]:
    return (
        _con_relaciones(db)
        .filter(SolicitudCita.paciente_id == paciente_id)
        .order_by(SolicitudCita.radicada_en.desc())
        .all()
    )


def listar(db: Session, limite: int = 500) -> list[SolicitudCita]:
    """HU-76: las pendientes primero y, dentro de cada grupo, las más antiguas primero."""
    return (
        _con_relaciones(db)
        .order_by(_PENDIENTES_PRIMERO, SolicitudCita.radicada_en)
        .limit(limite)
        .all()
    )


def radicadas_entre(db: Session, desde: datetime, hasta: datetime) -> list[SolicitudCita]:
    """HU-47, criterio 4: las radicadas en el periodo."""
    return (
        db.query(SolicitudCita)
        .filter(SolicitudCita.radicada_en >= desde, SolicitudCita.radicada_en < hasta)
        .all()
    )
