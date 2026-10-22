"""sesiones

Revision ID: a9e3c7b1d524
Revises: d8f4b2a6e913
Create Date: 2026-10-21 15:00:00.000000

RNF-17 (sesión única) y RNF-24 (cierre por inactividad): cada token
lleva el id de su sesión y se comprueba contra esta tabla.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'a9e3c7b1d524'
down_revision: Union[str, None] = 'd8f4b2a6e913'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sesiones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tipo", sa.String(10), nullable=False),
        sa.Column("sujeto_id", UUID(as_uuid=True), nullable=False),
        sa.Column("creada_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ultima_actividad_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cerrada_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_cierre", sa.String(20), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("dispositivo", sa.String(200), nullable=True),
    )
    op.create_index("ix_sesiones_sujeto_id", "sesiones", ["sujeto_id"])
    op.create_index(
        "ix_sesiones_abiertas", "sesiones", ["tipo", "sujeto_id"], postgresql_where=sa.text("cerrada_en IS NULL")
    )


def downgrade() -> None:
    op.drop_index("ix_sesiones_abiertas", table_name="sesiones")
    op.drop_index("ix_sesiones_sujeto_id", table_name="sesiones")
    op.drop_table("sesiones")
