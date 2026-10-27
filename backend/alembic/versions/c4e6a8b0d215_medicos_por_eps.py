"""medicos por eps

Revision ID: c4e6a8b0d215
Revises: b3d5f7a9c104
Create Date: 2026-10-27 15:00:00.000000

Cada médico atiende a los afiliados de una EPS, y dos EPS aliadas comparten
sus médicos:

- eps.nombre_corto: para mostrar junto al médico ("Sura", "Savia", "SOS").
- alianzas_eps: una fila por sentido. Se siembra Sura <-> Savia Salud.
- especialistas.eps_id: los médicos que ya existían quedan en Sura (la EPS
  de los pacientes de ejemplo).
- 20 médicos nuevos, de Sura, Savia Salud (aliada), Nueva EPS, Sanitas,
  Salud Total y Coosalud, con su horario semanal; su agenda la genera la
  API al arrancar (tareas_periodicas). Nombres inventados.
"""
import uuid
from datetime import time
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'c4e6a8b0d215'
down_revision: Union[str, None] = 'b3d5f7a9c104'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOMBRE_CORTO = {
    "Aliansalud": "Aliansalud",
    "Anas Wayuu": "Anas Wayuu",
    "Asmet Salud": "Asmet",
    "Asociación Indígena del Cauca": "AIC",
    "Cajacopi Atlántico": "Cajacopi",
    "Capital Salud": "Capital Salud",
    "Capresoca": "Capresoca",
    "Comfachocó": "Comfachocó",
    "Comfaoriente": "Comfaoriente",
    "Comfenalco Valle": "Comfenalco",
    "Compensar": "Compensar",
    "Coosalud": "Coosalud",
    "Dusakawi": "Dusakawi",
    "Empresas Públicas de Medellín (EPM)": "EPM",
    "Emssanar": "Emssanar",
    "Familiar de Colombia": "Familiar",
    "Famisanar": "Famisanar",
    "Fondo de Pasivo Social de Ferrocarriles Nacionales": "Ferrocarriles",
    "Mallamas": "Mallamas",
    "Mutual SER": "Mutual SER",
    "Nueva EPS": "Nueva EPS",
    "Pijaos Salud": "Pijaos",
    "Salud Mía": "Salud Mía",
    "Salud Total": "Salud Total",
    "Sanitas": "Sanitas",
    "Savia Salud": "Savia",
    "Servicio Occidental de Salud (SOS)": "SOS",
    "Sura": "Sura",
}

ALIANZAS = [("Sura", "Savia Salud")]
EPS_DE_LOS_EXISTENTES = "Sura"

LUN, MAR, MIE, JUE, VIE = range(5)
POBLADO, LAURELES, ENVIGADO = "Sede Poblado", "Sede Laureles", "Sede Envigado"

# Horarios semanales (sin cruces): [(días, sede, modalidad, desde, hasta)]
MANANAS_LMV = [((LUN, MIE), "{s}", "presencial", time(7, 0), time(11, 0)),
               ((VIE,), "{s}", "presencial", time(13, 0), time(16, 0))]
TARDES_MJ = [((MAR, JUE), "{s}", "presencial", time(13, 0), time(17, 0))]
MIXTO = [((LUN,), "{s}", "virtual", time(14, 0), time(17, 0)),
         ((MIE, VIE), "{s}", "presencial", time(8, 0), time(12, 0))]

# (nombre, EPS, especialidad, registro, horario, sede)
MEDICOS = [
    ("Dra. Adriana Lopera", "Sura", "Médico general", "05-201114", MANANAS_LMV, LAURELES),
    ("Dr. Gustavo Ochoa", "Sura", "Pediatría", "05-201227", TARDES_MJ, POBLADO),
    ("Dra. Liliana Posso", "Sura", "Cardiología", "05-201339", MIXTO, ENVIGADO),
    ("Dr. Hernán Bedoya", "Savia Salud", "Médico general", "05-202145", TARDES_MJ, LAURELES),
    ("Dra. Claudia Vélez Gómez", "Savia Salud", "Pediatría", "05-202258", MANANAS_LMV, POBLADO),
    ("Dr. Fabián Arenas", "Savia Salud", "Ortopedia", "05-202361", MIXTO, LAURELES),
    ("Dra. Patricia Giraldo", "Savia Salud", "Dermatología", "05-202474", TARDES_MJ, ENVIGADO),
    ("Dra. Beatriz Monsalve", "Nueva EPS", "Médico general", "05-203186", MIXTO, POBLADO),
    ("Dr. Rodrigo Saldarriaga", "Nueva EPS", "Cardiología", "05-203299", MANANAS_LMV, LAURELES),
    ("Dra. Elena Marín", "Nueva EPS", "Pediatría", "05-203302", TARDES_MJ, ENVIGADO),
    ("Dr. Wilson Tobón", "Nueva EPS", "Ortopedia", "05-203415", MANANAS_LMV, POBLADO),
    ("Dr. Iván Escobar", "Sanitas", "Médico general", "05-204127", MANANAS_LMV, ENVIGADO),
    ("Dra. Mariana Uribe", "Sanitas", "Dermatología", "05-204238", MIXTO, POBLADO),
    ("Dr. Nicolás Peláez", "Sanitas", "Cardiología", "05-204341", TARDES_MJ, LAURELES),
    ("Dra. Sandra Cadavid", "Salud Total", "Médico general", "05-205153", TARDES_MJ, POBLADO),
    ("Dr. Óscar Hoyos", "Salud Total", "Pediatría", "05-205266", MIXTO, ENVIGADO),
    ("Dra. Lucía Arbeláez", "Salud Total", "Ortopedia", "05-205379", TARDES_MJ, LAURELES),
    ("Dr. Diego Franco", "Coosalud", "Médico general", "05-206181", MIXTO, LAURELES),
    ("Dra. Gloria Zuluaga", "Coosalud", "Dermatología", "05-206294", MANANAS_LMV, LAURELES),
    ("Dr. Martín Echavarría", "Coosalud", "Cardiología", "05-206307", MANANAS_LMV, ENVIGADO),
]
DURACION_MINUTOS = 30


def upgrade() -> None:
    conexion = op.get_bind()

    op.add_column("eps", sa.Column("nombre_corto", sa.String(30), nullable=True))
    for nombre, corto in NOMBRE_CORTO.items():
        conexion.execute(sa.text("UPDATE eps SET nombre_corto = :c WHERE nombre = :n"), {"c": corto, "n": nombre})
    conexion.execute(sa.text("UPDATE eps SET nombre_corto = left(nombre, 30) WHERE nombre_corto IS NULL"))
    op.alter_column("eps", "nombre_corto", nullable=False)

    op.create_table(
        "alianzas_eps",
        sa.Column("eps_id", UUID(as_uuid=True), sa.ForeignKey("eps.id"), primary_key=True),
        sa.Column("aliada_id", UUID(as_uuid=True), sa.ForeignKey("eps.id"), primary_key=True),
        sa.CheckConstraint("eps_id <> aliada_id", name="ck_alianzas_eps_distintas"),
    )
    eps = dict(conexion.execute(sa.text("SELECT nombre, id FROM eps")).all())
    for a, b in ALIANZAS:
        if a in eps and b in eps:
            for x, y in ((a, b), (b, a)):
                conexion.execute(sa.text("INSERT INTO alianzas_eps (eps_id, aliada_id) VALUES (:x, :y)"),
                                 {"x": eps[x], "y": eps[y]})

    op.add_column("especialistas", sa.Column("eps_id", UUID(as_uuid=True), sa.ForeignKey("eps.id"), nullable=True))
    conexion.execute(sa.text("UPDATE especialistas SET eps_id = :e"), {"e": eps[EPS_DE_LOS_EXISTENTES]})
    op.alter_column("especialistas", "eps_id", nullable=False)
    op.create_index("ix_especialistas_eps_id", "especialistas", ["eps_id"])

    especialidades = dict(conexion.execute(sa.text("SELECT nombre, id FROM especialidades")).all())
    sedes = dict(conexion.execute(sa.text("SELECT nombre, id FROM sedes WHERE activa")).all())
    existentes = {n for (n,) in conexion.execute(sa.text("SELECT nombre FROM especialistas"))}
    for nombre, eps_nombre, especialidad, registro, horario, sede in MEDICOS:
        if nombre in existentes or especialidad not in especialidades or eps_nombre not in eps or not sedes:
            continue
        sede_id = sedes.get(sede) or next(iter(sedes.values()))
        especialista_id = uuid.uuid4()
        conexion.execute(
            sa.text(
                "INSERT INTO especialistas (id, nombre, especialidad_id, eps_id, registro_medico, activo, origen, creado_en) "
                "VALUES (:id, :n, :esp, :eps, :r, true, 'semilla', now())"
            ),
            {"id": especialista_id, "n": nombre, "esp": especialidades[especialidad], "eps": eps[eps_nombre], "r": registro},
        )
        conexion.execute(sa.text("INSERT INTO especialista_sedes (especialista_id, sede_id) VALUES (:e, :s)"),
                         {"e": especialista_id, "s": sede_id})
        for modalidad in sorted({m for _, _, m, _, _ in horario}):
            conexion.execute(
                sa.text("INSERT INTO especialista_modalidades (especialista_id, modalidad) VALUES (:e, :m)"),
                {"e": especialista_id, "m": modalidad},
            )
        for dias, _, modalidad, desde, hasta in horario:
            for dia in dias:
                conexion.execute(
                    sa.text(
                        "INSERT INTO turnos_especialista (id, especialista_id, dia_semana, sede_id, modalidad, "
                        "hora_inicio, hora_fin, duracion_minutos) VALUES (:id, :e, :d, :s, :m, :i, :f, :dur)"
                    ),
                    {"id": uuid.uuid4(), "e": especialista_id, "d": dia, "s": sede_id, "m": modalidad,
                     "i": desde, "f": hasta, "dur": DURACION_MINUTOS},
                )


def downgrade() -> None:
    conexion = op.get_bind()
    nombres = [m[0] for m in MEDICOS]
    ids = [i for (i,) in conexion.execute(sa.text("SELECT id FROM especialistas WHERE nombre = ANY(:n)"), {"n": nombres})]
    for tabla in ("turnos_especialista", "especialista_modalidades", "especialista_sedes"):
        conexion.execute(sa.text(f"DELETE FROM {tabla} WHERE especialista_id = ANY(:ids)"), {"ids": ids})
    # Sus horarios libres; los que ya tienen citas u ofertas se conservan (y con ellos el médico).
    conexion.execute(sa.text(
        "DELETE FROM disponibilidad d WHERE d.especialista_id = ANY(:ids) "
        "AND NOT EXISTS (SELECT 1 FROM citas c WHERE c.disponibilidad_id = d.id) "
        "AND NOT EXISTS (SELECT 1 FROM ofertas_espera o WHERE o.disponibilidad_id = d.id)"
    ), {"ids": ids})
    conexion.execute(sa.text(
        "DELETE FROM especialistas e WHERE e.id = ANY(:ids) "
        "AND NOT EXISTS (SELECT 1 FROM disponibilidad d WHERE d.especialista_id = e.id)"
    ), {"ids": ids})
    op.drop_index("ix_especialistas_eps_id", table_name="especialistas")
    op.drop_column("especialistas", "eps_id")
    op.drop_table("alianzas_eps")
    op.drop_column("eps", "nombre_corto")
