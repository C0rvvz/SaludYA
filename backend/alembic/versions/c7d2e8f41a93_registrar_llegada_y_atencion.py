"""registrar llegada y atencion de la cita

Revision ID: c7d2e8f41a93
Revises: a4f1c9e27b6d
Create Date: 2026-09-28 12:00:00.000000

Bloque 6 — el día de la consulta:
- HU-24 (presentarse): llegada_registrada_en (check-in del paciente).
- HU-25 (ser atendido): estados "atendida" y "no_asistio", y cerrada_en
  (cuándo se registró el resultado de la cita).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d2e8f41a93'
down_revision: Union[str, None] = 'a4f1c9e27b6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE estado_cita ADD VALUE IF NOT EXISTS 'atendida'")
        op.execute("ALTER TYPE estado_cita ADD VALUE IF NOT EXISTS 'no_asistio'")

    op.add_column("citas", sa.Column("llegada_registrada_en", sa.DateTime(timezone=True), nullable=True))
    op.add_column("citas", sa.Column("cerrada_en", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # El esquema anterior no distingue atendida / no asistió: vuelven a
    # "confirmada" (su franja ya pasó, así que no bloquean a nadie).
    op.execute("UPDATE citas SET estado = 'confirmada' WHERE estado IN ('atendida', 'no_asistio')")
    op.drop_column("citas", "cerrada_en")
    op.drop_column("citas", "llegada_registrada_en")

    # PostgreSQL no permite quitar valores de un enum: se recrea el tipo.
    # El índice parcial depende de la columna "estado": se recrea también.
    op.drop_index("uq_citas_disponibilidad_activa", table_name="citas")
    op.execute("ALTER TYPE estado_cita RENAME TO estado_cita_old")
    op.execute("CREATE TYPE estado_cita AS ENUM ('confirmada', 'cancelada', 'reprogramada')")
    op.execute(
        "ALTER TABLE citas ALTER COLUMN estado TYPE estado_cita USING estado::text::estado_cita"
    )
    op.execute("DROP TYPE estado_cita_old")
    op.create_index(
        "uq_citas_disponibilidad_activa",
        "citas",
        ["disponibilidad_id"],
        unique=True,
        postgresql_where=sa.text("estado = 'confirmada'"),
    )
