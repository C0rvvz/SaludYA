"""historia clinica

Revision ID: f7b9d1e3a548
Revises: e6a8c0d2f437
Create Date: 2026-10-27 22:00:00.000000

Módulo "Historia clínica" del personal (acceso restringido):
- Rol nuevo "medico". Su cuenta es la de uno de los médicos de la red
  (personal.especialista_id): solo ve la historia clínica de sus pacientes.
- formulas_medicas.diagnostico_cie10: el código CIE-10 del diagnóstico,
  cifrado como el diagnóstico. A las fórmulas que ya existían y salieron de
  los ejemplos de la IPS simulada se les pone su código; las demás quedan
  sin código hasta que alguien las corrija.
- La entrega en farmacia: en qué farmacia y cuándo fue la última
  (farmacia_entrega_id, ultima_entrega_en). Qué medicamento se entregó va
  dentro de los medicamentos (cifrados).

PostgreSQL no permite quitar un valor de un enum: al deshacer, las cuentas
con el rol "medico" se desactivan y pasan a "call_center" (sin datos
médicos), y el valor queda en el tipo.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from app.core.cifrado import DatoCifradoInvalidoError, cifrar, descifrar


# revision identifiers, used by Alembic.
revision: str = 'f7b9d1e3a548'
down_revision: Union[str, None] = 'e6a8c0d2f437'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Igual que formulas_service.EJEMPLOS (diagnóstico -> CIE-10)
CIE10_DE_LOS_EJEMPLOS = {
    "Faringitis aguda": "J02.9",
    "Hipertensión arterial en control": "I10",
    "Dermatitis de contacto": "L25.9",
    "Resfriado común": "J00",
    "Esguince de tobillo leve": "S93.4",
}


def upgrade() -> None:
    op.execute("ALTER TYPE rol_personal ADD VALUE IF NOT EXISTS 'medico'")
    op.add_column("personal", sa.Column("especialista_id", UUID(as_uuid=True), sa.ForeignKey("especialistas.id"),
                                        nullable=True))
    op.add_column("formulas_medicas", sa.Column("diagnostico_cie10", sa.Text(), nullable=True))
    op.add_column("formulas_medicas", sa.Column("farmacia_entrega_id", UUID(as_uuid=True),
                                                sa.ForeignKey("farmacias.id"), nullable=True))
    op.add_column("formulas_medicas", sa.Column("ultima_entrega_en", sa.DateTime(timezone=True), nullable=True))

    conexion = op.get_bind()
    for id_, diagnostico in conexion.execute(sa.text("SELECT id, diagnostico FROM formulas_medicas")).all():
        try:
            codigo = CIE10_DE_LOS_EJEMPLOS.get(descifrar(diagnostico, "formulas_medicas.diagnostico"))
        except DatoCifradoInvalidoError:
            continue  # cifrada con otra llave: se queda sin código

        if codigo:
            conexion.execute(
                sa.text("UPDATE formulas_medicas SET diagnostico_cie10 = :codigo WHERE id = :id"),
                {"codigo": cifrar(codigo, "formulas_medicas.diagnostico_cie10"), "id": id_},
            )


def downgrade() -> None:
    op.execute("UPDATE personal SET rol = 'call_center', activo = false WHERE rol = 'medico'")
    op.drop_column("formulas_medicas", "ultima_entrega_en")
    op.drop_column("formulas_medicas", "farmacia_entrega_id")
    op.drop_column("formulas_medicas", "diagnostico_cie10")
    op.drop_column("personal", "especialista_id")
