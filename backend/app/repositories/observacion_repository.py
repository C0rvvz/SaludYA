"""Acceso a datos de observaciones del personal — HU-41."""

import uuid

from sqlalchemy.orm import Session, joinedload

from app.models.observacion import Observacion


def listar_por_paciente(db: Session, paciente_id: uuid.UUID) -> list[Observacion]:
    return (
        db.query(Observacion)
        .options(joinedload(Observacion.autor), joinedload(Observacion.cita))
        .filter(Observacion.paciente_id == paciente_id)
        .order_by(Observacion.creado_en.desc())
        .all()
    )
