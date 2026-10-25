"""sedes administrables

Revision ID: e5f7a9c1d468
Revises: d4e6a8c0b357
Create Date: 2026-10-25 09:00:00.000000

RF-89: el administrador crea, edita y cierra sedes.
- direccion: para "Cómo llegar" con la dirección exacta (opcional).
- activa: una sede cerrada ya no se ofrece ni se puede usar en un horario;
  las citas que ya tenía se conservan.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f7a9c1d468'
down_revision: Union[str, None] = 'd4e6a8c0b357'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sedes", sa.Column("direccion", sa.String(150), nullable=True))
    op.add_column("sedes", sa.Column("activa", sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    op.drop_column("sedes", "activa")
    op.drop_column("sedes", "direccion")
