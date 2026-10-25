"""cifrar datos medicos

Revision ID: c3f5a7b9d246
Revises: b8e2d4f6a135
Create Date: 2026-10-24 12:00:00.000000

RNF-23: los textos con datos médicos se guardan cifrados con AES-256-GCM
(ver app/core/cifrado.py). Las columnas pasan a TEXT (el valor cifrado es
más largo que el texto) y lo que ya existía se cifra aquí mismo, con la
llave de CLAVE_CIFRADO_DATOS. Lo ya cifrado ("aes1:...") no se vuelve a
cifrar. Al deshacerla, se descifra.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.core.cifrado import PREFIJO, cifrar, descifrar


# revision identifiers, used by Alembic.
revision: str = 'c3f5a7b9d246'
down_revision: Union[str, None] = 'b8e2d4f6a135'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (tabla, columna): el contexto de cada valor cifrado es "tabla.columna".
COLUMNAS = [
    ("solicitudes_cita", "motivo"),
    ("solicitudes_cita", "respuesta"),
    ("observaciones", "texto"),
    ("citas", "motivo_cancelacion"),
    ("citas", "comentario_calificacion"),
    ("auditoria", "detalle"),
]


def _transformar(funcion, solo_sin_cifrar: bool) -> None:
    conexion = op.get_bind()
    for tabla, columna in COLUMNAS:
        condicion = "NOT LIKE" if solo_sin_cifrar else "LIKE"
        filas = conexion.execute(
            sa.text(f"SELECT id, {columna} FROM {tabla} WHERE {columna} IS NOT NULL AND {columna} {condicion} :prefijo"),
            {"prefijo": f"{PREFIJO}%"},
        ).all()
        for id_, valor in filas:
            conexion.execute(
                sa.text(f"UPDATE {tabla} SET {columna} = :valor WHERE id = :id"),
                {"valor": funcion(valor, f"{tabla}.{columna}"), "id": id_},
            )


def upgrade() -> None:
    op.alter_column("citas", "motivo_cancelacion", type_=sa.Text(), existing_nullable=True)
    op.alter_column("citas", "comentario_calificacion", type_=sa.Text(), existing_nullable=True)
    _transformar(cifrar, solo_sin_cifrar=True)


def downgrade() -> None:
    _transformar(descifrar, solo_sin_cifrar=False)
    op.alter_column("citas", "comentario_calificacion", type_=sa.String(500), existing_nullable=True)
    op.alter_column("citas", "motivo_cancelacion", type_=sa.String(300), existing_nullable=True)
