"""
Acceso a datos de Especialistas — HU-09, HU-12, HU-13, HU-14.

Nota sobre "modalidades": no es una relación normal de SQLAlchemy
porque Modalidad es un enum guardado directamente en la tabla de
asociación (especialista_modalidades), no una entidad propia con su
tabla — por eso se consulta aparte con una select() explícita.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.especialista import Especialista, especialista_modalidades


def listar_especialistas(
    db: Session, especialidad_id: uuid.UUID | None = None
) -> list[Especialista]:
    query = db.query(Especialista).options(
        joinedload(Especialista.especialidad),
        joinedload(Especialista.sedes),
    )
    # --- HU-09, criterios 3 y 4: filtrar por especialidad cuando se indique ---
    if especialidad_id is not None:
        query = query.filter(Especialista.especialidad_id == especialidad_id)
    return query.order_by(Especialista.nombre).all()


def obtener_por_id(db: Session, especialista_id: uuid.UUID) -> Especialista | None:
    return (
        db.query(Especialista)
        .options(joinedload(Especialista.especialidad), joinedload(Especialista.sedes))
        .filter(Especialista.id == especialista_id)
        .first()
    )


def obtener_modalidades(db: Session, especialista_id: uuid.UUID) -> list[str]:
    filas = db.execute(
        select(especialista_modalidades.c.modalidad).where(
            especialista_modalidades.c.especialista_id == especialista_id
        )
    ).all()
    return [fila[0].value for fila in filas]
