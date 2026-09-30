"""recordatorios programados

Revision ID: f3b8d1c6a205
Revises: e5a3b9c2d417
Create Date: 2026-09-29 12:00:00.000000

Centro de recordatorios: mensajes escritos (HU-64) y llamadas (HU-65)
que el personal programa para una fecha y hora.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID


# revision identifiers, used by Alembic.
revision: str = 'f3b8d1c6a205'
down_revision: Union[str, None] = 'e5a3b9c2d417'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# canal_contacto ya existe (lo usan las citas).
canal_contacto = ENUM(name="canal_contacto", create_type=False)
estado_programacion = sa.Enum("pendiente", "enviado", "fallido", name="estado_programacion")


def upgrade() -> None:
    op.create_table(
        "recordatorios_programados",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("paciente_id", UUID(as_uuid=True), sa.ForeignKey("pacientes.id"), nullable=False),
        sa.Column("cita_id", UUID(as_uuid=True), sa.ForeignKey("citas.id"), nullable=True),
        sa.Column("personal_id", UUID(as_uuid=True), sa.ForeignKey("personal.id"), nullable=False),
        sa.Column("canal", canal_contacto, nullable=False),
        sa.Column("plantilla", sa.String(40), nullable=True),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("programado_para", sa.DateTime(timezone=True), nullable=False),
        sa.Column("estado", estado_programacion, nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("enviado_en", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_recordatorios_programados_paciente_id", "recordatorios_programados", ["paciente_id"]
    )
    op.create_index(
        "ix_recordatorios_programados_programado_para", "recordatorios_programados", ["programado_para"]
    )
    op.create_index("ix_recordatorios_programados_estado", "recordatorios_programados", ["estado"])


def downgrade() -> None:
    op.drop_table("recordatorios_programados")
    estado_programacion.drop(op.get_bind())
