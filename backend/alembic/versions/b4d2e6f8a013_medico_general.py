"""medico general

Revision ID: b4d2e6f8a013
Revises: a9e3c7b1d524
Create Date: 2026-10-22 09:00:00.000000

Rediseño 2a: la especialidad se llama "Médico general" en toda la
interfaz (así la buscan los pacientes), no "Medicina General".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4d2e6f8a013'
down_revision: Union[str, None] = 'a9e3c7b1d524'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _renombrar(de: str, a: str) -> None:
    op.get_bind().execute(sa.text("UPDATE especialidades SET nombre = :a WHERE nombre = :de"), {"de": de, "a": a})


def upgrade() -> None:
    _renombrar("Medicina General", "Médico general")


def downgrade() -> None:
    _renombrar("Médico general", "Medicina General")
