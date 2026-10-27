"""formula medica y farmacias

Revision ID: f6a8b0c2d579
Revises: e5f7a9c1d468
Create Date: 2026-10-25 12:00:00.000000

- formulas_medicas: la fórmula de una cita atendida (datos médicos cifrados).
- farmacias: dónde reclamarla; las aliadas entregan gratis con el código.

Las farmacias de ejemplo tienen nombres inventados y solo su barrio (sin
dirección exacta), para no mandar a nadie a un lugar real por error: el
administrador pone las verdaderas en Personal › Especialistas › Farmacias.
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'f6a8b0c2d579'
down_revision: Union[str, None] = 'e5f7a9c1d468'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (nombre, barrio, ciudad, aliada, sede cercana, distancia en km)
FARMACIAS = [
    ("Droguería Vida Sana", "El Poblado", "Medellín", True, "Sede Poblado", 0.8),
    ("Farmacia La Esperanza", "Laureles", "Medellín", True, "Sede Laureles", 0.6),
    ("Droguería San Rafael", "Centro", "Envigado", True, "Sede Envigado", 0.5),
    ("Farmacia Nueva Salud", "Manila", "Medellín", False, "Sede Poblado", 1.4),
    ("Droguería El Estadio", "Estadio", "Medellín", False, "Sede Laureles", 1.2),
    ("Farmacia Las Vegas", "Las Vegas", "Envigado", False, "Sede Envigado", 1.6),
]


def upgrade() -> None:
    op.create_table(
        "formulas_medicas",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("cita_id", UUID(as_uuid=True), sa.ForeignKey("citas.id"), nullable=False, unique=True),
        sa.Column("codigo", sa.String(20), nullable=False, unique=True),
        sa.Column("diagnostico", sa.Text(), nullable=False),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("medicamentos", sa.Text(), nullable=False),
        sa.Column("recomendaciones", sa.Text(), nullable=False),
        sa.Column("cubierta_por_eps", sa.Boolean(), nullable=False),
        sa.Column("registrada_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("registrada_por", sa.String(150), nullable=False),
        sa.Column("vence_en", sa.Date(), nullable=False),
    )
    op.create_table(
        "farmacias",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("nombre", sa.String(100), nullable=False),
        sa.Column("barrio", sa.String(100), nullable=False),
        sa.Column("ciudad", sa.String(80), nullable=False),
        sa.Column("direccion", sa.String(150), nullable=True),
        sa.Column("aliada", sa.Boolean(), nullable=False),
        sa.Column("activa", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("sede_id", UUID(as_uuid=True), sa.ForeignKey("sedes.id"), nullable=True),
        sa.Column("distancia_km", sa.Float(), nullable=False),
    )
    conexion = op.get_bind()
    sedes = dict(conexion.execute(sa.text("SELECT nombre, id FROM sedes")).all())
    for nombre, barrio, ciudad, aliada, sede, distancia in FARMACIAS:
        conexion.execute(
            sa.text(
                "INSERT INTO farmacias (id, nombre, barrio, ciudad, aliada, sede_id, distancia_km) "
                "VALUES (:id, :nombre, :barrio, :ciudad, :aliada, :sede, :distancia)"
            ),
            {"id": uuid.uuid4(), "nombre": nombre, "barrio": barrio, "ciudad": ciudad, "aliada": aliada,
             "sede": sedes.get(sede), "distancia": distancia},
        )


def downgrade() -> None:
    op.drop_table("farmacias")
    op.drop_table("formulas_medicas")
