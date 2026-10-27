"""registro inalterable

Revision ID: a8c0e2f4b659
Revises: f7b9d1e3a548
Create Date: 2026-10-28 09:00:00.000000

La auditoría (HU-80 a HU-85) y los eventos de seguridad solo se agregan:
la propia base de datos rechaza cualquier UPDATE o DELETE sobre ellos, no
solo la aplicación (que nunca los cambia). Así nadie puede borrar el rastro
de lo que hizo, ni siquiera con acceso directo a la base.

SUPUESTO: si algún día hay que volver a cifrar auditoria.detalle con otra
llave, un administrador de la base desactiva el disparador a propósito
(ALTER TABLE auditoria DISABLE TRIGGER auditoria_inalterable) y lo vuelve a
activar al terminar; eso queda fuera de la aplicación.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a8c0e2f4b659'
down_revision: Union[str, None] = 'f7b9d1e3a548'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLAS = {"auditoria": "auditoria_inalterable", "eventos_seguridad": "eventos_seguridad_inalterables"}


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION impedir_cambios_en_registro() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'El registro de % no se puede modificar ni borrar.', TG_TABLE_NAME
                USING ERRCODE = 'insufficient_privilege';
        END;
        $$ LANGUAGE plpgsql
    """)
    for tabla, disparador in TABLAS.items():
        op.execute(
            f"CREATE TRIGGER {disparador} BEFORE UPDATE OR DELETE ON {tabla} "
            "FOR EACH ROW EXECUTE FUNCTION impedir_cambios_en_registro()"
        )


def downgrade() -> None:
    for tabla, disparador in TABLAS.items():
        op.execute(f"DROP TRIGGER IF EXISTS {disparador} ON {tabla}")
    op.execute("DROP FUNCTION IF EXISTS impedir_cambios_en_registro()")
