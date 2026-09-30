"""lista de espera

Revision ID: a7c4e2f9b318
Revises: f3b8d1c6a205
Create Date: 2026-09-29 18:00:00.000000

Lista de espera del paciente (HU-19, HU-31, HU-32): solicitudes con sus
preferencias y los cupos que se les ofrecen.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID


# revision identifiers, used by Alembic.
revision: str = 'a7c4e2f9b318'
down_revision: Union[str, None] = 'f3b8d1c6a205'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Ya existen (los usan las citas y la disponibilidad).
modalidad = ENUM(name="modalidad", create_type=False)
canal_contacto = ENUM(name="canal_contacto", create_type=False)

jornada = sa.Enum("manana", "tarde", "cualquiera", name="jornada")
prioridad_medica = sa.Enum("normal", "alta", "urgente", name="prioridad_medica")
estado_solicitud = sa.Enum("en_espera", "cupo_ofrecido", "asignada", "cancelada", name="estado_solicitud_espera")
estado_oferta = sa.Enum("pendiente", "aceptada", "rechazada", "vencida", name="estado_oferta_espera")


def upgrade() -> None:
    op.create_table(
        "solicitudes_espera",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("paciente_id", UUID(as_uuid=True), sa.ForeignKey("pacientes.id"), nullable=False),
        sa.Column("especialidad_id", UUID(as_uuid=True), sa.ForeignKey("especialidades.id"), nullable=False),
        sa.Column("jornada", jornada, nullable=False),
        sa.Column("modalidad", modalidad, nullable=True),
        sa.Column("canal", canal_contacto, nullable=False),
        sa.Column("prioridad", prioridad_medica, nullable=False),
        sa.Column("estado", estado_solicitud, nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cerrada_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cita_id", UUID(as_uuid=True), sa.ForeignKey("citas.id"), nullable=True),
    )
    op.create_index("ix_solicitudes_espera_paciente_id", "solicitudes_espera", ["paciente_id"])
    op.create_index("ix_solicitudes_espera_especialidad_id", "solicitudes_espera", ["especialidad_id"])
    op.create_index(
        "uq_solicitudes_espera_activa",
        "solicitudes_espera",
        ["paciente_id", "especialidad_id"],
        unique=True,
        postgresql_where=sa.text("estado IN ('en_espera', 'cupo_ofrecido')"),
    )

    op.create_table(
        "solicitud_espera_sedes",
        sa.Column("solicitud_id", UUID(as_uuid=True), sa.ForeignKey("solicitudes_espera.id"), primary_key=True),
        sa.Column("sede_id", UUID(as_uuid=True), sa.ForeignKey("sedes.id"), primary_key=True),
    )

    op.create_table(
        "ofertas_espera",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("solicitud_id", UUID(as_uuid=True), sa.ForeignKey("solicitudes_espera.id"), nullable=False),
        sa.Column("disponibilidad_id", UUID(as_uuid=True), sa.ForeignKey("disponibilidad.id"), nullable=False),
        sa.Column("ofrecida_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expira_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("estado", estado_oferta, nullable=False),
        sa.Column("respondida_en", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ofertas_espera_solicitud_id", "ofertas_espera", ["solicitud_id"])
    op.create_index(
        "uq_ofertas_espera_pendiente",
        "ofertas_espera",
        ["disponibilidad_id"],
        unique=True,
        postgresql_where=sa.text("estado = 'pendiente'"),
    )


def downgrade() -> None:
    op.drop_table("ofertas_espera")
    op.drop_table("solicitud_espera_sedes")
    op.drop_table("solicitudes_espera")
    bind = op.get_bind()
    for tipo in (estado_oferta, estado_solicitud, prioridad_medica, jornada):
        tipo.drop(bind)
