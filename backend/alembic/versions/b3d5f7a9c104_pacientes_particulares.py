"""pacientes particulares

Revision ID: b3d5f7a9c104
Revises: a1c3e5b7d902
Create Date: 2026-10-27 13:00:00.000000

Quien no tiene EPS y se atiende con médicos particulares puede registrarse:
queda sin EPS (eps_id ya admitía null) y con el estado de afiliación
"particular" (no hay EPS a la cual consultar).

PostgreSQL no permite quitar un valor de un enum: al deshacer, los
particulares pasan a "pendiente" y el valor "particular" queda en el tipo.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b3d5f7a9c104'
down_revision: Union[str, None] = 'a1c3e5b7d902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE estado_afiliacion ADD VALUE IF NOT EXISTS 'particular'")


def downgrade() -> None:
    op.execute("UPDATE pacientes SET estado_afiliacion = 'pendiente' WHERE estado_afiliacion = 'particular'")
