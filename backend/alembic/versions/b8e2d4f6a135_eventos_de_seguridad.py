"""eventos de seguridad

Revision ID: b8e2d4f6a135
Revises: a6c4e2f8b917
Create Date: 2026-10-24 09:00:00.000000

Panel "Seguridad" del administrador (tipo SIEM): ingresos exitosos y
fallidos, bloqueos, accesos sin permiso, tokens alterados y sesiones
reemplazadas o cerradas por un administrador. Ver models/evento_seguridad.py.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'b8e2d4f6a135'
down_revision: Union[str, None] = 'a6c4e2f8b917'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "eventos_seguridad",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False),
        sa.Column("severidad", sa.String(10), nullable=False),
        sa.Column("ambito", sa.String(10), nullable=False),
        sa.Column("sujeto_id", UUID(as_uuid=True), nullable=True),
        sa.Column("sujeto_nombre", sa.String(150), nullable=True),
        sa.Column("identificador", sa.String(150), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("dispositivo", sa.String(200), nullable=True),
        sa.Column("descripcion", sa.String(300), nullable=False),
        sa.Column("detalle", sa.Text(), nullable=True),
    )
    op.create_index("ix_eventos_seguridad_fecha", "eventos_seguridad", ["fecha"])
    op.create_index("ix_eventos_seguridad_tipo", "eventos_seguridad", ["tipo"])
    op.create_index("ix_eventos_seguridad_sujeto_id", "eventos_seguridad", ["sujeto_id"])


def downgrade() -> None:
    op.drop_index("ix_eventos_seguridad_sujeto_id", table_name="eventos_seguridad")
    op.drop_index("ix_eventos_seguridad_tipo", table_name="eventos_seguridad")
    op.drop_index("ix_eventos_seguridad_fecha", table_name="eventos_seguridad")
    op.drop_table("eventos_seguridad")
