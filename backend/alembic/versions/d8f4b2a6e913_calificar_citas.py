"""calificar citas atendidas

Revision ID: d8f4b2a6e913
Revises: c5e1a8d3f207
Create Date: 2026-10-01 10:00:00.000000

El paciente califica de 1 a 5 la atención de una cita atendida, con un
comentario opcional; con eso se calcula la satisfacción de los
pacientes en los reportes (HU-71).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8f4b2a6e913'
down_revision: Union[str, None] = 'c5e1a8d3f207'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("citas", sa.Column("calificacion", sa.SmallInteger(), nullable=True))
    op.add_column("citas", sa.Column("comentario_calificacion", sa.String(length=500), nullable=True))
    op.add_column("citas", sa.Column("calificada_en", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("ck_citas_calificacion", "citas", "calificacion BETWEEN 1 AND 5")


def downgrade() -> None:
    op.drop_constraint("ck_citas_calificacion", "citas", type_="check")
    op.drop_column("citas", "calificada_en")
    op.drop_column("citas", "comentario_calificacion")
    op.drop_column("citas", "calificacion")
