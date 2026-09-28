"""personal, auditoria y observaciones

Revision ID: e5a3b9c2d417
Revises: c7d2e8f41a93
Create Date: 2026-09-28 16:00:00.000000

Apartado de administración:
- personal: cuentas del personal de la EPS / IPS, con su rol.
- auditoria: trazabilidad de cada acción sobre las citas (HU-80 a HU-85).
- observaciones: notas del personal sobre un paciente o cita (HU-41).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'e5a3b9c2d417'
down_revision: Union[str, None] = 'c7d2e8f41a93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

rol_personal = sa.Enum(
    "administrador", "agendamiento", "call_center", "coordinador_medico", name="rol_personal"
)
tipo_actor = sa.Enum("paciente", "personal", "sistema", name="tipo_actor")


def upgrade() -> None:
    op.create_table(
        "personal",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("nombre", sa.String(150), nullable=False),
        sa.Column("correo", sa.String(150), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("rol", rol_personal, nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ultimo_acceso_en", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_personal_correo", "personal", ["correo"], unique=True)

    op.create_table(
        "auditoria",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_tipo", tipo_actor, nullable=False),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=True),
        sa.Column("actor_nombre", sa.String(150), nullable=False),
        sa.Column("accion", sa.String(40), nullable=False),
        sa.Column("descripcion", sa.String(300), nullable=False),
        sa.Column("detalle", sa.Text(), nullable=True),
        sa.Column("cita_id", UUID(as_uuid=True), sa.ForeignKey("citas.id"), nullable=True),
        sa.Column("paciente_id", UUID(as_uuid=True), sa.ForeignKey("pacientes.id"), nullable=True),
        sa.Column("numero_comprobante", sa.String(20), nullable=True),
        sa.Column("estado_anterior", sa.String(60), nullable=True),
        sa.Column("estado_nuevo", sa.String(60), nullable=True),
    )
    op.create_index("ix_auditoria_fecha", "auditoria", ["fecha"])
    op.create_index("ix_auditoria_accion", "auditoria", ["accion"])
    op.create_index("ix_auditoria_cita_id", "auditoria", ["cita_id"])
    op.create_index("ix_auditoria_paciente_id", "auditoria", ["paciente_id"])

    op.create_table(
        "observaciones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("paciente_id", UUID(as_uuid=True), sa.ForeignKey("pacientes.id"), nullable=False),
        sa.Column("cita_id", UUID(as_uuid=True), sa.ForeignKey("citas.id"), nullable=True),
        sa.Column("personal_id", UUID(as_uuid=True), sa.ForeignKey("personal.id"), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_observaciones_paciente_id", "observaciones", ["paciente_id"])


def downgrade() -> None:
    op.drop_index("ix_observaciones_paciente_id", table_name="observaciones")
    op.drop_table("observaciones")
    op.drop_index("ix_auditoria_paciente_id", table_name="auditoria")
    op.drop_index("ix_auditoria_cita_id", table_name="auditoria")
    op.drop_index("ix_auditoria_accion", table_name="auditoria")
    op.drop_index("ix_auditoria_fecha", table_name="auditoria")
    op.drop_table("auditoria")
    op.drop_index("ix_personal_correo", table_name="personal")
    op.drop_table("personal")
    tipo_actor.drop(op.get_bind(), checkfirst=True)
    rol_personal.drop(op.get_bind(), checkfirst=True)
