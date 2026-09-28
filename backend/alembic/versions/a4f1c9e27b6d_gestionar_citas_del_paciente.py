"""gestionar citas del paciente: cancelar, reprogramar, confirmar asistencia y recordatorios

Revision ID: a4f1c9e27b6d
Revises: 68c2843c218e
Create Date: 2026-09-28 10:00:00.000000

Bloque 5 — gestionar la cita mientras llega la fecha:
- HU-21 (cancelar): estado "cancelada", fecha y motivo.
- HU-20 (reprogramar): estado "reprogramada" en la cita original, y la
  cita nueva apunta a la original (reprogramada_desde_id).
- HU-29 / HU-23 (confirmar asistencia): fecha de confirmación.
- HU-22 (recordatorios): fecha de envío e intentos, para no enviar dos
  veces y reintentar si el envío falla.
- HU-18 (estado): cada cambio queda con su fecha, de ahí se arma la
  línea de tiempo del estado de la cita.

La restricción UNIQUE(disponibilidad_id) pasa a aplicar solo a las citas
activas (estado 'confirmada'): una cita cancelada o reprogramada conserva
su franja como historial, pero ese cupo liberado debe poder agendarse de
nuevo por otro paciente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'a4f1c9e27b6d'
down_revision: Union[str, None] = '68c2843c218e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE se ejecuta fuera de la transacción de la
    # migración: PostgreSQL no permite usar un valor nuevo de un enum en
    # la misma transacción en que se agrega.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE estado_cita ADD VALUE IF NOT EXISTS 'cancelada'")
        op.execute("ALTER TYPE estado_cita ADD VALUE IF NOT EXISTS 'reprogramada'")

    op.add_column("citas", sa.Column("asistencia_confirmada_en", sa.DateTime(timezone=True), nullable=True))
    op.add_column("citas", sa.Column("cancelada_en", sa.DateTime(timezone=True), nullable=True))
    op.add_column("citas", sa.Column("motivo_cancelacion", sa.String(300), nullable=True))
    op.add_column("citas", sa.Column("reprogramada_en", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "citas",
        sa.Column(
            "reprogramada_desde_id",
            UUID(as_uuid=True),
            sa.ForeignKey("citas.id", name="fk_citas_reprogramada_desde"),
            nullable=True,
        ),
    )
    op.add_column("citas", sa.Column("recordatorio_enviado_en", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "citas",
        sa.Column("recordatorio_intentos", sa.Integer(), nullable=False, server_default="0"),
    )

    op.drop_constraint("citas_disponibilidad_id_key", "citas", type_="unique")
    op.create_index("ix_citas_disponibilidad_id", "citas", ["disponibilidad_id"])
    op.create_index(
        "uq_citas_disponibilidad_activa",
        "citas",
        ["disponibilidad_id"],
        unique=True,
        postgresql_where=sa.text("estado = 'confirmada'"),
    )


def downgrade() -> None:
    # Con pérdida de datos: el esquema anterior no puede representar
    # citas canceladas ni reprogramadas, así que se eliminan (y las
    # franjas que ocupaban quedan como estaban).
    op.execute("UPDATE citas SET reprogramada_desde_id = NULL")
    op.execute("DELETE FROM citas WHERE estado <> 'confirmada'")

    op.drop_index("uq_citas_disponibilidad_activa", table_name="citas")
    op.drop_index("ix_citas_disponibilidad_id", table_name="citas")
    op.create_unique_constraint("citas_disponibilidad_id_key", "citas", ["disponibilidad_id"])

    op.drop_column("citas", "recordatorio_intentos")
    op.drop_column("citas", "recordatorio_enviado_en")
    op.drop_column("citas", "reprogramada_desde_id")
    op.drop_column("citas", "reprogramada_en")
    op.drop_column("citas", "motivo_cancelacion")
    op.drop_column("citas", "cancelada_en")
    op.drop_column("citas", "asistencia_confirmada_en")

    # PostgreSQL no permite quitar valores de un enum: se recrea el tipo.
    op.execute("ALTER TYPE estado_cita RENAME TO estado_cita_old")
    op.execute("CREATE TYPE estado_cita AS ENUM ('confirmada')")
    op.execute(
        "ALTER TABLE citas ALTER COLUMN estado TYPE estado_cita USING estado::text::estado_cita"
    )
    op.execute("DROP TYPE estado_cita_old")
