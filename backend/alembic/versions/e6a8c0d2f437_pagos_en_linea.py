"""pagos en linea

Revision ID: e6a8c0d2f437
Revises: d5f7b9c1e326
Create Date: 2026-10-27 20:00:00.000000

- pagos: cada intento de pagar en línea una cita atendida (PSE o tarjeta),
  con su referencia, estado y código de llegada. De la tarjeta solo queda
  la marca y los 4 últimos números (models/pago.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'e6a8c0d2f437'
down_revision: Union[str, None] = 'd5f7b9c1e326'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pagos",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("cita_id", UUID(as_uuid=True), sa.ForeignKey("citas.id"), nullable=False, index=True),
        sa.Column("referencia", sa.String(20), nullable=False, unique=True),
        sa.Column("metodo", sa.String(10), nullable=False),
        sa.Column("estado", sa.String(12), nullable=False),
        sa.Column("valor", sa.Integer(), nullable=False),
        sa.Column("detalle", sa.String(80), nullable=False),
        sa.Column("motivo", sa.String(150), nullable=True),
        sa.Column("transaccion", sa.String(40), nullable=False),
        sa.Column("codigo_llegada", sa.String(4), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("pagos")
