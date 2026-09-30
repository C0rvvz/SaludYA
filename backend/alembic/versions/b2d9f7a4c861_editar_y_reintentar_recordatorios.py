"""editar y reintentar recordatorios programados

Revision ID: b2d9f7a4c861
Revises: a7c4e2f9b318
Create Date: 2026-09-29 21:00:00.000000

Centro de recordatorios: un recordatorio programado se puede cancelar
(estado "cancelado") y, si falla, se reintenta solo (columna "intentos").
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2d9f7a4c861'
down_revision: Union[str, None] = 'a7c4e2f9b318'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_programacion ADD VALUE IF NOT EXISTS 'cancelado'")
    op.add_column(
        "recordatorios_programados",
        sa.Column("intentos", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.execute("UPDATE recordatorios_programados SET estado = 'fallido' WHERE estado = 'cancelado'")
    op.drop_column("recordatorios_programados", "intentos")
    # PostgreSQL no permite quitar un valor de un enum; "cancelado" queda
    # definido pero sin uso (el upgrade usa IF NOT EXISTS).
