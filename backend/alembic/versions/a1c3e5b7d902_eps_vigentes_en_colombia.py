"""eps vigentes en colombia

Revision ID: a1c3e5b7d902
Revises: f6a8b0c2d579
Create Date: 2026-10-27 12:00:00.000000

Migración de DATOS: el catálogo de EPS pasa de 6 a las 28 que el
Ministerio de Salud reportó habilitadas (listado de julio de 2025), en
los regímenes contributivo y subsidiado, incluidas las EPS indígenas.

Los nombres van sin la palabra "EPS" (se entiende por el campo): "Sura" en
vez de "EPS Sura". "Nueva EPS" se queda así porque es su nombre propio.
"EPS Sura" se renombra (no se borra): los pacientes que ya la tienen la
conservan.

Sigue siendo un catálogo simulado: no hay integración con ninguna EPS.
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c3e5b7d902'
down_revision: Union[str, None] = 'f6a8b0c2d579'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RENOMBRADAS = {"EPS Sura": "Sura"}

# Las 28 habilitadas (Ministerio de Salud, julio de 2025), sin la palabra "EPS".
EPS_VIGENTES = [
    "Aliansalud",
    "Anas Wayuu",
    "Asmet Salud",
    "Asociación Indígena del Cauca",
    "Cajacopi Atlántico",
    "Capital Salud",
    "Capresoca",
    "Comfachocó",
    "Comfaoriente",
    "Comfenalco Valle",
    "Compensar",
    "Coosalud",
    "Dusakawi",
    "Empresas Públicas de Medellín (EPM)",
    "Emssanar",
    "Familiar de Colombia",
    "Famisanar",
    "Fondo de Pasivo Social de Ferrocarriles Nacionales",
    "Mallamas",
    "Mutual SER",
    "Nueva EPS",
    "Pijaos Salud",
    "Salud Mía",
    "Salud Total",
    "Sanitas",
    "Savia Salud",
    "Servicio Occidental de Salud (SOS)",
    "Sura",
]


def upgrade() -> None:
    conexion = op.get_bind()
    for antes, despues in RENOMBRADAS.items():
        conexion.execute(sa.text("UPDATE eps SET nombre = :despues WHERE nombre = :antes"),
                         {"antes": antes, "despues": despues})
    existentes = {nombre for (nombre,) in conexion.execute(sa.text("SELECT nombre FROM eps"))}
    for nombre in EPS_VIGENTES:
        if nombre not in existentes:
            conexion.execute(sa.text("INSERT INTO eps (id, nombre) VALUES (:id, :nombre)"),
                             {"id": uuid.uuid4(), "nombre": nombre})


def downgrade() -> None:
    conexion = op.get_bind()
    # Se quitan las agregadas que nadie usa; las 6 iniciales siempre se quedan.
    iniciales = {"Sura", "Sanitas", "Nueva EPS", "Compensar", "Salud Total", "Famisanar"}
    for nombre in set(EPS_VIGENTES) - iniciales:
        conexion.execute(
            sa.text(
                "DELETE FROM eps WHERE nombre = :nombre "
                "AND NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.eps_id = eps.id)"
            ),
            {"nombre": nombre},
        )
    for antes, despues in RENOMBRADAS.items():
        conexion.execute(sa.text("UPDATE eps SET nombre = :antes WHERE nombre = :despues"),
                         {"antes": antes, "despues": despues})
