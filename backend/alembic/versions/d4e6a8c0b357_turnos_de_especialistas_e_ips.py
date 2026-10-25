"""turnos de especialistas e IPS simulada

Revision ID: d4e6a8c0b357
Revises: c3f5a7b9d246
Create Date: 2026-10-24 15:00:00.000000

- especialistas: registro médico, activo, origen y fecha de creación.
- turnos_especialista: el horario semanal de cada especialista. Las
  franjas se generan de aquí (disponibilidad_service): ya no "todas las
  sedes a las mismas horas", que ponía al mismo médico a la misma hora en
  dos sedes.
- sincronizaciones_ips: cada actualización (simulada) de la IPS.

A los 5 especialistas del catálogo de ejemplo se les da un horario
realista con sus mismas sedes y modalidades. Las franjas FUTURAS libres
del esquema anterior (sin cita ni cupo ofrecido) se borran: la tarea de
fondo genera las nuevas a partir de los turnos. Las que tienen cita se
conservan.
"""
from datetime import time
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID


# revision identifiers, used by Alembic.
revision: str = 'd4e6a8c0b357'
down_revision: Union[str, None] = 'c3f5a7b9d246'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LUN, MAR, MIE, JUE, VIE, SAB = range(6)

# nombre: (registro médico, duración de cada cita, [(días, sede, modalidad, desde, hasta)])
HORARIOS = {
    "Dr. Carlos Ramírez": ("05-104233", 30, [
        ((LUN, MIE), "Sede Poblado", "presencial", time(7, 0), time(12, 0)),
        ((MAR, JUE), "Sede Laureles", "presencial", time(14, 0), time(18, 0)),
        ((VIE,), "Sede Poblado", "virtual", time(8, 0), time(11, 0)),
    ]),
    "Dra. Ana Gómez": ("05-118702", 20, [
        ((LUN, MIE, VIE), "Sede Poblado", "presencial", time(13, 0), time(17, 0)),
        ((MAR, JUE), "Sede Poblado", "presencial", time(8, 0), time(12, 0)),
    ]),
    "Dr. Luis Torres": ("05-097415", 20, [
        ((LUN, MIE, VIE), "Sede Poblado", "presencial", time(7, 0), time(12, 0)),
        ((MAR, JUE), "Sede Envigado", "presencial", time(7, 0), time(12, 0)),
        ((LUN, MIE), "Sede Envigado", "virtual", time(14, 0), time(17, 0)),
    ]),
    "Dra. Marcela Ruiz": ("05-121958", 20, [
        ((LUN, MAR, MIE, JUE), "Sede Laureles", "presencial", time(8, 0), time(12, 0)),
        ((SAB,), "Sede Laureles", "presencial", time(8, 0), time(11, 0)),
    ]),
    "Dr. Andrés Salazar": ("05-109864", 20, [
        ((MAR, JUE), "Sede Envigado", "presencial", time(7, 0), time(12, 0)),
        ((MIE,), "Sede Envigado", "presencial", time(14, 0), time(18, 0)),
    ]),
}


def upgrade() -> None:
    op.add_column("especialistas", sa.Column("registro_medico", sa.String(20), nullable=True))
    op.add_column("especialistas", sa.Column("activo", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column("especialistas", sa.Column("origen", sa.String(10), server_default="semilla", nullable=False))
    op.add_column(
        "especialistas",
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "turnos_especialista",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("especialista_id", UUID(as_uuid=True), sa.ForeignKey("especialistas.id"), nullable=False),
        sa.Column("dia_semana", sa.SmallInteger(), nullable=False),
        sa.Column("sede_id", UUID(as_uuid=True), sa.ForeignKey("sedes.id"), nullable=False),
        sa.Column(
            "modalidad",
            ENUM("presencial", "virtual", name="modalidad", create_type=False),  # ya existe
            nullable=False,
        ),
        sa.Column("hora_inicio", sa.Time(), nullable=False),
        sa.Column("hora_fin", sa.Time(), nullable=False),
        sa.Column("duracion_minutos", sa.SmallInteger(), nullable=False),
        sa.CheckConstraint("dia_semana BETWEEN 0 AND 5", name="ck_turnos_dia_semana"),
        sa.CheckConstraint("hora_inicio < hora_fin", name="ck_turnos_horas"),
    )
    op.create_index("ix_turnos_especialista_especialista_id", "turnos_especialista", ["especialista_id"])

    op.create_table(
        "sincronizaciones_ips",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("origen", sa.String(12), nullable=False),
        sa.Column("solicitada_por", sa.String(150), nullable=True),
        sa.Column("especialistas_nuevos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("especialistas_retirados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("franjas_creadas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("desde", sa.Date(), nullable=True),
        sa.Column("hasta", sa.Date(), nullable=True),
        sa.Column("detalle", sa.Text(), nullable=True),
    )
    op.create_index("ix_sincronizaciones_ips_fecha", "sincronizaciones_ips", ["fecha"])

    conexion = op.get_bind()
    sedes = dict(conexion.execute(sa.text("SELECT nombre, id FROM sedes")).all())
    cargados = []
    for nombre, (registro, duracion, bloques) in HORARIOS.items():
        especialista_id = conexion.execute(
            sa.text("SELECT id FROM especialistas WHERE nombre = :n"), {"n": nombre}
        ).scalar()
        if especialista_id is None:
            continue
        cargados.append(nombre)
        conexion.execute(
            sa.text("UPDATE especialistas SET registro_medico = :r WHERE id = :id"), {"r": registro, "id": especialista_id}
        )
        for dias, sede, modalidad, desde, hasta in bloques:
            for dia in dias:
                conexion.execute(
                    sa.text(
                        "INSERT INTO turnos_especialista (id, especialista_id, dia_semana, sede_id, modalidad, "
                        "hora_inicio, hora_fin, duracion_minutos) VALUES (:id, :e, :d, :s, :m, :i, :f, :dur)"
                    ),
                    {"id": uuid.uuid4(), "e": especialista_id, "d": dia, "s": sedes[sede], "m": modalidad,
                     "i": desde, "f": hasta, "dur": duracion},
                )

    # Las franjas futuras libres del esquema anterior: las reemplazan las de los turnos.
    conexion.execute(sa.text(
        "DELETE FROM disponibilidad d WHERE d.fecha > (now() AT TIME ZONE 'America/Bogota')::date "
        "AND NOT EXISTS (SELECT 1 FROM citas c WHERE c.disponibilidad_id = d.id) "
        "AND NOT EXISTS (SELECT 1 FROM ofertas_espera o WHERE o.disponibilidad_id = d.id)"
    ))

    # La carga inicial cuenta como la primera actualización: la siguiente automática, en 10 días.
    conexion.execute(
        sa.text(
            "INSERT INTO sincronizaciones_ips (id, fecha, origen, especialistas_nuevos, detalle) "
            "VALUES (:id, now(), 'inicial', :n, :detalle)"
        ),
        {"id": uuid.uuid4(), "n": len(cargados),
         "detalle": "Carga inicial con su horario semanal: " + ", ".join(cargados) if cargados else None},
    )


def downgrade() -> None:
    op.drop_index("ix_sincronizaciones_ips_fecha", table_name="sincronizaciones_ips")
    op.drop_table("sincronizaciones_ips")
    op.drop_index("ix_turnos_especialista_especialista_id", table_name="turnos_especialista")
    op.drop_table("turnos_especialista")
    for columna in ("creado_en", "origen", "activo", "registro_medico"):
        op.drop_column("especialistas", columna)
