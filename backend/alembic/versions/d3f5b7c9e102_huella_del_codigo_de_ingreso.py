"""huella del codigo de ingreso

Revision ID: d3f5b7c9e102
Revises: c2e4a6b8d091
Create Date: 2026-10-28 21:00:00.000000

Seguridad: del código de ingreso del paciente (OTP) ya no se guarda el
código sino su huella (HMAC-SHA256 con la llave del servidor; ver
core/security.huella_otp). Quien lea la base ya no puede entrar con un
código vigente.

Los códigos pendientes al migrar quedan invalidados (vencen en 5 minutos
de todos modos): el paciente pide otro.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3f5b7c9e102'
down_revision: Union[str, None] = 'c2e4a6b8d091'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE codigos_otp SET estado = 'invalidado' WHERE estado = 'pendiente'")
    op.alter_column("codigos_otp", "codigo", new_column_name="codigo_hash", type_=sa.String(64),
                    existing_nullable=False)
    # Los códigos ya usados o vencidos no sirven para nada: no se dejan en claro.
    op.execute("UPDATE codigos_otp SET codigo_hash = md5(random()::text) || md5(random()::text)")


def downgrade() -> None:
    # Una huella no se puede volver código: los registros se borran (son de un solo uso y duran minutos).
    op.execute("DELETE FROM codigos_otp")
    op.alter_column("codigos_otp", "codigo_hash", new_column_name="codigo", type_=sa.String(6),
                    existing_nullable=False)
