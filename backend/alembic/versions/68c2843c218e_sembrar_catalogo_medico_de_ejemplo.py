"""sembrar catalogo medico de ejemplo

Revision ID: 68c2843c218e
Revises: 32d3037675e3
Create Date: 2026-09-01 19:27:53.348114

Migración de DATOS (no de esquema): siembra especialidades, sedes,
especialistas (con sus sedes y modalidades, ya modeladas N:N como se
definió) y franjas de disponibilidad de ejemplo -- necesarias para
poder probar de principio a fin HU-09, HU-10, HU-12, HU-13 y HU-14.

Las 5 especialidades usadas son las mismas que ya existían en el
prototipo original de SaludYA (panel de inasistencias por
especialidad), no fueron inventadas para esta migración.

Las fechas de las franjas de disponibilidad se calculan en el momento
en que esta migración se EJECUTA (no cuando se escribió el código),
así que siempre generan próximos días hábiles reales.
"""
import uuid
from datetime import date, time, timedelta
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import table, column


# revision identifiers, used by Alembic.
revision: str = '68c2843c218e'
down_revision: Union[str, None] = 'd191362e0f1a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


especialidades_t = table(
    "especialidades",
    column("id", UUID(as_uuid=True)),
    column("nombre", sa.String),
)
sedes_t = table(
    "sedes",
    column("id", UUID(as_uuid=True)),
    column("nombre", sa.String),
    column("ciudad", sa.String),
)
especialistas_t = table(
    "especialistas",
    column("id", UUID(as_uuid=True)),
    column("nombre", sa.String),
    column("especialidad_id", UUID(as_uuid=True)),
)
especialista_sedes_t = table(
    "especialista_sedes",
    column("especialista_id", UUID(as_uuid=True)),
    column("sede_id", UUID(as_uuid=True)),
)
especialista_modalidades_t = table(
    "especialista_modalidades",
    column("especialista_id", UUID(as_uuid=True)),
    column("modalidad", sa.String),
)
disponibilidad_t = table(
    "disponibilidad",
    column("id", UUID(as_uuid=True)),
    column("especialista_id", UUID(as_uuid=True)),
    column("sede_id", UUID(as_uuid=True)),
    column("modalidad", sa.String),
    column("fecha", sa.Date),
    column("hora", sa.Time),
    column("estado", sa.String),
)

HORAS_DEL_DIA = [time(8, 0), time(10, 0), time(15, 0)]


def _proximos_dias_habiles(n: int) -> list[date]:
    dias = []
    cursor = date.today() + timedelta(days=1)
    while len(dias) < n:
        if cursor.weekday() < 5:  # 0=lunes ... 4=viernes
            dias.append(cursor)
        cursor += timedelta(days=1)
    return dias


def upgrade() -> None:
    # --- Especialidades ---
    nombres_especialidades = [
        "Cardiología", "Dermatología", "Medicina General", "Ortopedia", "Pediatría",
    ]
    especialidad_ids = {nombre: uuid.uuid4() for nombre in nombres_especialidades}
    op.bulk_insert(
        especialidades_t,
        [{"id": eid, "nombre": nombre} for nombre, eid in especialidad_ids.items()],
    )

    # --- Sedes ---
    sedes_data = [
        ("Sede Poblado", "Medellín"),
        ("Sede Laureles", "Medellín"),
        ("Sede Envigado", "Envigado"),
    ]
    sede_ids = {nombre: uuid.uuid4() for nombre, _ in sedes_data}
    op.bulk_insert(
        sedes_t,
        [
            {"id": sede_ids[nombre], "nombre": nombre, "ciudad": ciudad}
            for nombre, ciudad in sedes_data
        ],
    )

    # --- Especialistas: (nombre, especialidad, [sedes que atiende], [modalidades]) ---
    especialistas_data = [
        ("Dr. Carlos Ramírez", "Cardiología",
         ["Sede Poblado", "Sede Laureles"], ["presencial", "virtual"]),
        ("Dra. Ana Gómez", "Dermatología",
         ["Sede Poblado"], ["presencial"]),
        ("Dr. Luis Torres", "Medicina General",
         ["Sede Poblado", "Sede Envigado"], ["presencial", "virtual"]),
        ("Dra. Marcela Ruiz", "Pediatría",
         ["Sede Laureles"], ["presencial"]),
        ("Dr. Andrés Salazar", "Ortopedia",
         ["Sede Envigado"], ["presencial"]),
    ]

    especialista_rows = []
    especialista_sede_rows = []
    especialista_modalidad_rows = []
    disponibilidad_rows = []

    dias_habiles = _proximos_dias_habiles(5)

    for nombre, especialidad, sedes_nombres, modalidades in especialistas_data:
        especialista_id = uuid.uuid4()
        especialista_rows.append({
            "id": especialista_id,
            "nombre": nombre,
            "especialidad_id": especialidad_ids[especialidad],
        })

        for sede_nombre in sedes_nombres:
            especialista_sede_rows.append({
                "especialista_id": especialista_id,
                "sede_id": sede_ids[sede_nombre],
            })

        for modalidad in modalidades:
            especialista_modalidad_rows.append({
                "especialista_id": especialista_id,
                "modalidad": modalidad,
            })

        # --- Disponibilidad: una franja por cada combinación de sede
        # que atiende + modalidad que ofrece, en los próximos 5 días
        # hábiles, a 3 horas por día. La franja de las 8:00 queda
        # "reservada" a propósito, para poder demostrar que HU-10
        # (criterio 3) nunca la muestra. ---
        for sede_nombre in sedes_nombres:
            for modalidad in modalidades:
                for dia in dias_habiles:
                    for i, hora in enumerate(HORAS_DEL_DIA):
                        estado = "reservado" if i == 0 else "disponible"
                        disponibilidad_rows.append({
                            "id": uuid.uuid4(),
                            "especialista_id": especialista_id,
                            "sede_id": sede_ids[sede_nombre],
                            "modalidad": modalidad,
                            "fecha": dia,
                            "hora": hora,
                            "estado": estado,
                        })

    op.bulk_insert(especialistas_t, especialista_rows)
    op.bulk_insert(especialista_sedes_t, especialista_sede_rows)
    op.bulk_insert(especialista_modalidades_t, especialista_modalidad_rows)
    op.bulk_insert(disponibilidad_t, disponibilidad_rows)


def downgrade() -> None:
    op.execute(disponibilidad_t.delete())
    op.execute(especialista_modalidades_t.delete())
    op.execute(especialista_sedes_t.delete())
    op.execute(especialistas_t.delete())
    op.execute(sedes_t.delete())
    op.execute(especialidades_t.delete())
