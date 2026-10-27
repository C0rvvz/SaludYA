"""particulares y valor de la cita

Revision ID: d5f7b9c1e326
Revises: c4e6a8b0d215
Create Date: 2026-10-27 18:00:00.000000

- Médicos particulares: especialistas.eps_id admite null (no atiende por
  EPS). Cualquiera puede agendar con ellos, pagando la consulta. Se
  siembran 4, con su horario semanal.
- Valor de cada cita (eps_service.cobro), fijado al agendar:
  citas.tipo_cobro ("eps", "aliada" o "particular") y citas.valor (pesos).
  Las que ya existían se calculan con la misma regla.
- "Savia Salud" se muestra completo junto al médico ("Savia Salud · aliada").
"""
import uuid
from datetime import time
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5f7b9c1e326'
down_revision: Union[str, None] = 'c4e6a8b0d215'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Igual que eps_service.TARIFAS (pesos colombianos)
TARIFAS = {"eps": 8000, "aliada": 12000, "particular": 100000}

LUN, MAR, MIE, JUE, VIE = range(5)
# (nombre, especialidad, registro, [(días, sede, desde, hasta)])
PARTICULARES = [
    ("Dr. Mauricio Gil", "Médico general", "05-301118", [((LUN, MIE, VIE), "Sede Poblado", time(14, 0), time(18, 0))]),
    ("Dra. Isabel Montoya", "Médico general", "05-301229", [((MAR, JUE), "Sede Laureles", time(7, 0), time(11, 0))]),
    ("Dr. Ernesto Villa", "Cardiología", "05-301332", [((MAR, JUE), "Sede Poblado", time(8, 0), time(12, 0))]),
    ("Dra. Teresa Lozano", "Dermatología", "05-301445", [((LUN, MIE), "Sede Envigado", time(13, 0), time(17, 0))]),
]
DURACION_MINUTOS = 30


def upgrade() -> None:
    conexion = op.get_bind()
    op.alter_column("especialistas", "eps_id", nullable=True)
    conexion.execute(sa.text("UPDATE eps SET nombre_corto = 'Savia Salud' WHERE nombre = 'Savia Salud'"))

    especialidades = dict(conexion.execute(sa.text("SELECT nombre, id FROM especialidades")).all())
    sedes = dict(conexion.execute(sa.text("SELECT nombre, id FROM sedes WHERE activa")).all())
    existentes = {n for (n,) in conexion.execute(sa.text("SELECT nombre FROM especialistas"))}
    for nombre, especialidad, registro, horario in PARTICULARES:
        if nombre in existentes or especialidad not in especialidades or not sedes:
            continue
        especialista_id = uuid.uuid4()
        conexion.execute(
            sa.text(
                "INSERT INTO especialistas (id, nombre, especialidad_id, eps_id, registro_medico, activo, origen, creado_en) "
                "VALUES (:id, :n, :esp, NULL, :r, true, 'semilla', now())"
            ),
            {"id": especialista_id, "n": nombre, "esp": especialidades[especialidad], "r": registro},
        )
        usadas = set()
        for dias, sede, desde, hasta in horario:
            sede_id = sedes.get(sede) or next(iter(sedes.values()))
            if sede_id not in usadas:
                usadas.add(sede_id)
                conexion.execute(sa.text("INSERT INTO especialista_sedes (especialista_id, sede_id) VALUES (:e, :s)"),
                                 {"e": especialista_id, "s": sede_id})
            for dia in dias:
                conexion.execute(
                    sa.text(
                        "INSERT INTO turnos_especialista (id, especialista_id, dia_semana, sede_id, modalidad, "
                        "hora_inicio, hora_fin, duracion_minutos) VALUES (:id, :e, :d, :s, 'presencial', :i, :f, :dur)"
                    ),
                    {"id": uuid.uuid4(), "e": especialista_id, "d": dia, "s": sede_id, "i": desde, "f": hasta,
                     "dur": DURACION_MINUTOS},
                )
        conexion.execute(
            sa.text("INSERT INTO especialista_modalidades (especialista_id, modalidad) VALUES (:e, 'presencial')"),
            {"e": especialista_id},
        )

    op.add_column("citas", sa.Column("tipo_cobro", sa.String(12), server_default="eps", nullable=False))
    op.add_column("citas", sa.Column("valor", sa.Integer(), server_default="0", nullable=False))
    # Las que ya existían: la misma regla de eps_service.cobro.
    conexion.execute(sa.text(
        "UPDATE citas c SET tipo_cobro = CASE "
        "  WHEN p.eps_id IS NULL OR e.eps_id IS NULL THEN 'particular' "
        "  WHEN p.eps_id = e.eps_id THEN 'eps' "
        "  WHEN EXISTS (SELECT 1 FROM alianzas_eps a WHERE a.eps_id = p.eps_id AND a.aliada_id = e.eps_id) THEN 'aliada' "
        "  ELSE 'particular' END "
        "FROM pacientes p, disponibilidad d, especialistas e "
        "WHERE p.id = c.paciente_id AND d.id = c.disponibilidad_id AND e.id = d.especialista_id"
    ))
    for tipo, valor in TARIFAS.items():
        conexion.execute(sa.text("UPDATE citas SET valor = :v WHERE tipo_cobro = :t"), {"v": valor, "t": tipo})


def downgrade() -> None:
    conexion = op.get_bind()
    op.drop_column("citas", "valor")
    op.drop_column("citas", "tipo_cobro")
    nombres = [m[0] for m in PARTICULARES]
    ids = [i for (i,) in conexion.execute(sa.text("SELECT id FROM especialistas WHERE nombre = ANY(:n)"), {"n": nombres})]
    for tabla in ("turnos_especialista", "especialista_modalidades", "especialista_sedes"):
        conexion.execute(sa.text(f"DELETE FROM {tabla} WHERE especialista_id = ANY(:ids)"), {"ids": ids})
    conexion.execute(sa.text(
        "DELETE FROM disponibilidad d WHERE d.especialista_id = ANY(:ids) "
        "AND NOT EXISTS (SELECT 1 FROM citas c WHERE c.disponibilidad_id = d.id) "
        "AND NOT EXISTS (SELECT 1 FROM ofertas_espera o WHERE o.disponibilidad_id = d.id)"
    ), {"ids": ids})
    conexion.execute(sa.text(
        "DELETE FROM especialistas e WHERE e.id = ANY(:ids) "
        "AND NOT EXISTS (SELECT 1 FROM disponibilidad d WHERE d.especialista_id = e.id)"
    ), {"ids": ids})
    # Si quedó algún particular (con citas), pasa a Sura para poder volver a exigir la EPS.
    conexion.execute(sa.text(
        "UPDATE especialistas SET eps_id = (SELECT id FROM eps WHERE nombre = 'Sura') WHERE eps_id IS NULL"
    ))
    op.alter_column("especialistas", "eps_id", nullable=False)
    conexion.execute(sa.text("UPDATE eps SET nombre_corto = 'Savia' WHERE nombre = 'Savia Salud'"))
