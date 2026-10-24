"""auditoria de cuentas del personal

Revision ID: a6c4e2f8b917
Revises: b4d2e6f8a013
Create Date: 2026-10-23 09:00:00.000000

La auditoría también registra quién crea, desactiva, activa o cambia el
rol o la contraseña de una cuenta del personal, de forma legible:
- actor_correo: el correo de quien lo hizo (además de su nombre y rol).
- cuenta_*: la cuenta afectada (nombre, correo y rol en ese momento).
Se guardan como texto, igual que actor_nombre (HU-84): no cambian si
después cambia la cuenta.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'a6c4e2f8b917'
down_revision: Union[str, None] = 'b4d2e6f8a013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("auditoria", sa.Column("actor_correo", sa.String(150), nullable=True))
    op.add_column("auditoria", sa.Column("cuenta_id", UUID(as_uuid=True), sa.ForeignKey("personal.id"), nullable=True))
    op.add_column("auditoria", sa.Column("cuenta_nombre", sa.String(150), nullable=True))
    op.add_column("auditoria", sa.Column("cuenta_correo", sa.String(150), nullable=True))
    op.add_column("auditoria", sa.Column("cuenta_rol", sa.String(40), nullable=True))
    op.create_index("ix_auditoria_cuenta_id", "auditoria", ["cuenta_id"])


def downgrade() -> None:
    op.drop_index("ix_auditoria_cuenta_id", table_name="auditoria")
    for columna in ("cuenta_rol", "cuenta_correo", "cuenta_nombre", "cuenta_id", "actor_correo"):
        op.drop_column("auditoria", columna)
