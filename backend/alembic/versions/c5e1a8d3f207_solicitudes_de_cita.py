"""solicitudes de cita (cartas de petición)

Revision ID: c5e1a8d3f207
Revises: b2d9f7a4c861
Create Date: 2026-09-29 23:00:00.000000

Cartas de petición que radica el paciente y su revisión clínica
(HU-76 a HU-79; indicadores de HU-46 y HU-47).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID


# revision identifiers, used by Alembic.
revision: str = 'c5e1a8d3f207'
down_revision: Union[str, None] = 'b2d9f7a4c861'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

canal_contacto = ENUM(name="canal_contacto", create_type=False)  # ya existe
tipo_solicitud = sa.Enum("formal", "derecho_peticion", name="tipo_solicitud")
tipo_cita = sa.Enum("primera_vez", "control", name="tipo_cita")
estado_solicitud_cita = sa.Enum("pendiente", "pendiente_eps", "aprobada", "negada", name="estado_solicitud_cita")


def upgrade() -> None:
    op.create_table(
        "solicitudes_cita",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("numero_radicado", sa.String(20), nullable=False, unique=True),
        sa.Column("paciente_id", UUID(as_uuid=True), sa.ForeignKey("pacientes.id"), nullable=False),
        sa.Column("tipo", tipo_solicitud, nullable=False),
        sa.Column("especialidad_id", UUID(as_uuid=True), sa.ForeignKey("especialidades.id"), nullable=False),
        sa.Column("tipo_cita", tipo_cita, nullable=False),
        sa.Column("fecha_deseada", sa.Date(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("canal", canal_contacto, nullable=False),
        sa.Column("estado", estado_solicitud_cita, nullable=False),
        sa.Column("radicada_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revisada_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revisor_id", UUID(as_uuid=True), sa.ForeignKey("personal.id"), nullable=True),
        sa.Column("prioritaria", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("respuesta", sa.Text(), nullable=True),
        sa.Column("enviada_eps_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("respuesta_eps_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cita_id", UUID(as_uuid=True), sa.ForeignKey("citas.id"), nullable=True),
    )
    op.create_index("ix_solicitudes_cita_paciente_id", "solicitudes_cita", ["paciente_id"])
    op.create_index("ix_solicitudes_cita_estado", "solicitudes_cita", ["estado"])
    op.create_index("ix_solicitudes_cita_radicada_en", "solicitudes_cita", ["radicada_en"])


def downgrade() -> None:
    op.drop_table("solicitudes_cita")
    bind = op.get_bind()
    for tipo in (estado_solicitud_cita, tipo_cita, tipo_solicitud):
        tipo.drop(bind)
