"""sembrar catalogo de eps

Revision ID: 32d3037675e3
Revises: 501d6a741051
Create Date: 2026-09-01 04:25:29.794060

Migración de DATOS (no de esquema): siembra un catálogo inicial de
EPS colombianas reales para que el formulario de registro (HU-08)
tenga opciones reales entre las cuales elegir. No representa ninguna
integración con esas EPS -- es solo el catálogo de nombres que el
paciente puede seleccionar.
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import table, column


# revision identifiers, used by Alembic.
revision: str = '32d3037675e3'
down_revision: Union[str, None] = '501d6a741051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


eps_table = table(
    "eps",
    column("id", UUID(as_uuid=True)),
    column("nombre", sa.String),
)

NOMBRES_EPS = [
    "EPS Sura",
    "Sanitas",
    "Nueva EPS",
    "Compensar",
    "Salud Total",
    "Famisanar",
]


def upgrade() -> None:
    op.bulk_insert(
        eps_table,
        [{"id": uuid.uuid4(), "nombre": nombre} for nombre in NOMBRES_EPS],
    )


def downgrade() -> None:
    op.execute(eps_table.delete().where(eps_table.c.nombre.in_(NOMBRES_EPS)))
