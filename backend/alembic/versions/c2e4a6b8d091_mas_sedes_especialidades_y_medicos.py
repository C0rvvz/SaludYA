"""mas sedes, especialidades y medicos

Revision ID: c2e4a6b8d091
Revises: a8c0e2f4b659
Create Date: 2026-10-28 09:00:00.000000

Migración de DATOS: la red crece para que la demostración se parezca a una
EPS real del área metropolitana de Medellín.

- 8 sedes nuevas: Bello, Manrique, Castilla, Prado, Robledo, Belén, Itagüí
  y Sabaneta (sin dirección exacta: "Cómo llegar" lleva al barrio o al
  municipio, para no mandar a nadie a un lugar real por error).
- 22 especialidades nuevas. 16 llegan con médicos; Alergología, Geriatría,
  Hematología, Infectología, Nefrología y Oncología quedan SIN médicos a
  propósito: el paciente ve que por el momento no hay quien lo atienda y
  puede solicitar una petición. La IPS simulada no les trae médicos (ver
  ips_simulada_service); el personal puede agregarlos.
- 48 médicos nuevos de las EPS de la red y particulares, con su horario
  semanal (nunca a la misma hora en dos sedes). Su agenda la genera la
  API al arrancar (tareas_periodicas). Nombres inventados.
- Una farmacia aliada cerca de cada sede nueva (solo el barrio).
"""
import uuid
from datetime import time
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2e4a6b8d091'
down_revision: Union[str, None] = 'a8c0e2f4b659'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

POBLADO, LAURELES, ENVIGADO = "Sede Poblado", "Sede Laureles", "Sede Envigado"
BELLO, MANRIQUE, CASTILLA, PRADO = "Sede Bello", "Sede Manrique", "Sede Castilla", "Sede Prado"
ROBLEDO, BELEN, ITAGUI, SABANETA = "Sede Robledo", "Sede Belén", "Sede Itagüí", "Sede Sabaneta"

SEDES = [
    (BELLO, "Bello"),
    (MANRIQUE, "Medellín"),
    (CASTILLA, "Medellín"),
    (PRADO, "Medellín"),
    (ROBLEDO, "Medellín"),
    (BELEN, "Medellín"),
    (ITAGUI, "Itagüí"),
    (SABANETA, "Sabaneta"),
]

CON_MEDICOS = [
    "Endocrinología", "Fisioterapia", "Gastroenterología", "Ginecología y obstetricia", "Medicina interna",
    "Neumología", "Neurología", "Nutrición y dietética", "Odontología", "Oftalmología", "Optometría",
    "Otorrinolaringología", "Psicología", "Psiquiatría", "Reumatología", "Urología",
]
SIN_MEDICOS = ["Alergología", "Geriatría", "Hematología", "Infectología", "Nefrología", "Oncología"]

LUN, MAR, MIE, JUE, VIE, SAB = range(6)
PRESENCIAL, VIRTUAL = "presencial", "virtual"


# Horarios semanales: [(días, sede, modalidad, desde, hasta)]. Un solo turno por día.
def manana(sede, dias=(LUN, MIE, VIE)):
    return [(dias, sede, PRESENCIAL, time(7, 0), time(12, 0))]


def tarde(sede, dias=(MAR, JUE)):
    return [(dias, sede, PRESENCIAL, time(13, 0), time(18, 0))]


def dos_sedes(una, otra):
    return [((LUN, MIE), una, PRESENCIAL, time(8, 0), time(12, 0)),
            ((MAR, JUE), otra, PRESENCIAL, time(13, 0), time(17, 0))]


def con_virtual(sede):
    return [((LUN, MIE), sede, PRESENCIAL, time(8, 0), time(12, 0)),
            ((VIE,), sede, VIRTUAL, time(14, 0), time(17, 0))]


def con_sabado(sede):
    return [((MAR, JUE), sede, PRESENCIAL, time(7, 0), time(11, 0)),
            ((SAB,), sede, PRESENCIAL, time(8, 0), time(11, 0))]


# Minutos de cada cita (las demás, 20).
DURACION = {
    "Psicología": 40, "Psiquiatría": 40, "Fisioterapia": 40, "Neurología": 30, "Endocrinología": 30,
    "Gastroenterología": 30, "Medicina interna": 30, "Nutrición y dietética": 30, "Neumología": 30,
    "Reumatología": 30,
}

PARTICULAR = None
# (nombre, EPS, especialidad, registro médico, horario)
MEDICOS = [
    # Médico general y pediatría en las sedes nuevas
    ("Dra. Yolanda Restrepo Gil", "Savia Salud", "Médico general", "05-401101", manana(BELLO)),
    ("Dr. Fernando Castaño", "Sura", "Médico general", "05-401112", tarde(BELLO)),
    ("Dra. Marta Lucía Pino", "Nueva EPS", "Médico general", "05-401123", manana(MANRIQUE)),
    ("Dr. Julián Ocampo", "Coosalud", "Médico general", "05-401134", tarde(CASTILLA)),
    ("Dra. Rocío Henao Ruiz", "Sanitas", "Médico general", "05-401145", con_virtual(PRADO)),
    ("Dr. Héctor Mazo", "Salud Total", "Médico general", "05-401156", manana(ROBLEDO)),
    ("Dra. Ana María Quintero", "Sura", "Médico general", "05-401167", tarde(BELEN)),
    ("Dr. Pablo Urrego", PARTICULAR, "Médico general", "05-401178", con_sabado(ITAGUI)),
    ("Dra. Diana Sierra", "Savia Salud", "Médico general", "05-401189", manana(SABANETA, (LUN, MAR, JUE))),
    ("Dra. Carmen Elena Ruiz", "Savia Salud", "Pediatría", "05-401201", dos_sedes(MANRIQUE, BELLO)),
    ("Dr. Tomás Gutiérrez", "Sura", "Pediatría", "05-401212", manana(BELEN, (MAR, JUE))),
    ("Dra. Lina Marcela Duque", "Nueva EPS", "Pediatría", "05-401223", con_sabado(CASTILLA)),
    # Especialidades nuevas
    ("Dra. Verónica Salazar", "Sura", "Ginecología y obstetricia", "05-402101", dos_sedes(POBLADO, BELEN)),
    ("Dra. Alba Lucía Mejía", "Savia Salud", "Ginecología y obstetricia", "05-402112", tarde(BELLO, (LUN, MIE))),
    ("Dr. Germán Ospina", PARTICULAR, "Ginecología y obstetricia", "05-402123", manana(LAURELES, (MAR, JUE))),
    ("Dr. Rubén Darío Zapata", "Sura", "Oftalmología", "05-402201", tarde(LAURELES)),
    ("Dra. Silvia Correa", "Nueva EPS", "Oftalmología", "05-402212", manana(ITAGUI, (LUN, MIE))),
    ("Dra. Paola Franco", "Sura", "Odontología", "05-402301", manana(PRADO)),
    ("Dr. Andrés Felipe Gómez", "Savia Salud", "Odontología", "05-402312", tarde(MANRIQUE)),
    ("Dra. Luisa Fernanda Ríos", "Salud Total", "Odontología", "05-402323", tarde(SABANETA)),
    ("Dr. Mateo Arboleda", PARTICULAR, "Odontología", "05-402334", con_sabado(POBLADO)),
    ("Dra. Claudia Patricia Mora", "Sura", "Psicología", "05-402401", con_virtual(LAURELES)),
    ("Dr. Esteban Jaramillo", "Coosalud", "Psicología", "05-402412", tarde(CASTILLA, (LUN, MIE))),
    ("Dra. Manuela Ochoa Restrepo", PARTICULAR, "Psicología", "05-402423", con_virtual(ENVIGADO)),
    ("Dr. Álvaro Mesa", "Sura", "Psiquiatría", "05-402501", tarde(POBLADO, (LUN, JUE))),
    ("Dra. Inés Cardona", "Nueva EPS", "Psiquiatría", "05-402512", manana(PRADO, (MAR, JUE))),
    ("Dr. Gabriel Sánchez", "Sura", "Neurología", "05-402601", manana(LAURELES, (LUN, MIE))),
    ("Dra. Natalia Vélez Uribe", "Sanitas", "Neurología", "05-402612", tarde(POBLADO, (MAR, VIE))),
    ("Dra. Olga Lucía Toro", "Savia Salud", "Endocrinología", "05-402701", manana(BELEN, (LUN, MIE))),
    ("Dr. Raúl Estrada", PARTICULAR, "Endocrinología", "05-402712", tarde(ENVIGADO)),
    ("Dr. Samuel Botero", "Sura", "Gastroenterología", "05-402801", manana(ENVIGADO, (MAR, JUE))),
    ("Dra. Juliana Cano", "Salud Total", "Gastroenterología", "05-402812", tarde(ITAGUI, (LUN, MIE))),
    ("Dr. Francisco Rojas", "Nueva EPS", "Medicina interna", "05-402901", con_virtual(MANRIQUE)),
    ("Dra. Adriana Muñetón", "Sura", "Medicina interna", "05-402912", tarde(ROBLEDO)),
    ("Dr. León Darío Giraldo", "Savia Salud", "Medicina interna", "05-402923", manana(BELLO, (MAR, JUE))),
    ("Dr. Ignacio Vargas", "Sura", "Otorrinolaringología", "05-403001", manana(POBLADO, (MAR, JUE))),
    ("Dra. Margarita Arias", "Coosalud", "Otorrinolaringología", "05-403012", manana(CASTILLA)),
    ("Dr. Arturo Henao", "Sanitas", "Urología", "05-403101", tarde(LAURELES, (LUN, MIE))),
    ("Dr. Mario Alzate", "Savia Salud", "Urología", "05-403112", tarde(PRADO)),
    ("Dra. Camila Restrepo Toro", "Sura", "Nutrición y dietética", "05-403201", con_virtual(SABANETA)),
    ("Dra. Estefanía López", "Nueva EPS", "Nutrición y dietética", "05-403212", manana(ROBLEDO, (MAR, JUE))),
    ("Dr. Daniel Ramírez Soto", "Sura", "Fisioterapia", "05-403301", tarde(BELEN, (LUN, MIE, VIE))),
    ("Dra. Tatiana Mejía", "Savia Salud", "Fisioterapia", "05-403312", con_sabado(BELLO)),
    ("Dra. Alejandra Pérez", "Salud Total", "Fisioterapia", "05-403323", manana(ITAGUI, (MAR, JUE, VIE))),
    ("Dr. Simón Correa", PARTICULAR, "Optometría", "05-403401", con_sabado(LAURELES)),
    ("Dra. Kelly Johana Mena", "Coosalud", "Optometría", "05-403412", manana(MANRIQUE, (MAR, JUE))),
    ("Dr. Eduardo Palacio", "Sura", "Neumología", "05-403501", tarde(ENVIGADO, (LUN, MIE))),
    ("Dra. Gloria Inés Bermúdez", "Nueva EPS", "Reumatología", "05-403601", manana(POBLADO, (LUN, VIE))),
]

# (nombre, barrio, ciudad, sede cercana, distancia en km): aliadas, nombres inventados.
FARMACIAS = [
    ("Droguería Bienestar", "Niquía", "Bello", BELLO, 0.7),
    ("Farmacia San José", "Manrique Central", "Medellín", MANRIQUE, 0.5),
    ("Droguería Salud Plena", "Florencia", "Medellín", CASTILLA, 0.6),
    ("Farmacia El Prado", "Prado", "Medellín", PRADO, 0.4),
    ("Droguería La Familia", "Robledo", "Medellín", ROBLEDO, 0.8),
    ("Farmacia Buena Salud", "La Mota", "Medellín", BELEN, 0.9),
    ("Droguería Santa María", "Santa María", "Itagüí", ITAGUI, 0.7),
    ("Farmacia Vida Nueva", "Las Lomitas", "Sabaneta", SABANETA, 0.6),
]


def _ids(conexion, consulta: str) -> dict:
    return dict(conexion.execute(sa.text(consulta)).all())


def upgrade() -> None:
    conexion = op.get_bind()

    sedes = _ids(conexion, "SELECT nombre, id FROM sedes")
    for nombre, ciudad in SEDES:
        if nombre not in sedes:
            sedes[nombre] = uuid.uuid4()
            conexion.execute(
                sa.text("INSERT INTO sedes (id, nombre, ciudad, activa) VALUES (:id, :n, :c, true)"),
                {"id": sedes[nombre], "n": nombre, "c": ciudad},
            )

    especialidades = _ids(conexion, "SELECT nombre, id FROM especialidades")
    for nombre in CON_MEDICOS + SIN_MEDICOS:
        if nombre not in especialidades:
            especialidades[nombre] = uuid.uuid4()
            conexion.execute(sa.text("INSERT INTO especialidades (id, nombre) VALUES (:id, :n)"),
                             {"id": especialidades[nombre], "n": nombre})

    eps = _ids(conexion, "SELECT nombre, id FROM eps")
    activas = _ids(conexion, "SELECT nombre, id FROM sedes WHERE activa")
    existentes = {n for (n,) in conexion.execute(sa.text("SELECT nombre FROM especialistas"))}
    for nombre, eps_nombre, especialidad, registro, horario in MEDICOS:
        if nombre in existentes or (eps_nombre is not None and eps_nombre not in eps):
            continue
        # Si el personal cerró una de las sedes del horario, ese turno pasa a la primera abierta.
        bloques = [(dias, activas.get(sede) or next(iter(activas.values())), modalidad, desde, hasta)
                   for dias, sede, modalidad, desde, hasta in horario]
        especialista_id = uuid.uuid4()
        conexion.execute(
            sa.text(
                "INSERT INTO especialistas (id, nombre, especialidad_id, eps_id, registro_medico, activo, origen, creado_en) "
                "VALUES (:id, :n, :esp, :eps, :r, true, 'semilla', now())"
            ),
            {"id": especialista_id, "n": nombre, "esp": especialidades[especialidad],
             "eps": eps.get(eps_nombre), "r": registro},
        )
        for sede_id in {b[1] for b in bloques}:
            conexion.execute(sa.text("INSERT INTO especialista_sedes (especialista_id, sede_id) VALUES (:e, :s)"),
                             {"e": especialista_id, "s": sede_id})
        for modalidad in sorted({b[2] for b in bloques}):
            conexion.execute(
                sa.text("INSERT INTO especialista_modalidades (especialista_id, modalidad) VALUES (:e, :m)"),
                {"e": especialista_id, "m": modalidad},
            )
        for dias, sede_id, modalidad, desde, hasta in bloques:
            for dia in dias:
                conexion.execute(
                    sa.text(
                        "INSERT INTO turnos_especialista (id, especialista_id, dia_semana, sede_id, modalidad, "
                        "hora_inicio, hora_fin, duracion_minutos) VALUES (:id, :e, :d, :s, :m, :i, :f, :dur)"
                    ),
                    {"id": uuid.uuid4(), "e": especialista_id, "d": dia, "s": sede_id, "m": modalidad,
                     "i": desde, "f": hasta, "dur": DURACION.get(especialidad, 20)},
                )

    for nombre, barrio, ciudad, sede, distancia in FARMACIAS:
        repetida = conexion.execute(
            sa.text("SELECT 1 FROM farmacias WHERE lower(nombre) = lower(:n) AND lower(barrio) = lower(:b)"),
            {"n": nombre, "b": barrio},
        ).first()
        if repetida is None:
            conexion.execute(
                sa.text(
                    "INSERT INTO farmacias (id, nombre, barrio, ciudad, aliada, activa, sede_id, distancia_km) "
                    "VALUES (:id, :n, :b, :c, true, true, :s, :d)"
                ),
                {"id": uuid.uuid4(), "n": nombre, "b": barrio, "c": ciudad, "s": sedes[sede], "d": distancia},
            )


def downgrade() -> None:
    conexion = op.get_bind()
    nombres = [m[0] for m in MEDICOS]
    ids = [i for (i,) in conexion.execute(sa.text("SELECT id FROM especialistas WHERE nombre = ANY(:n)"), {"n": nombres})]
    # Sus horarios libres; los que ya tienen citas u ofertas se conservan (y con ellos el médico y su sede).
    conexion.execute(sa.text(
        "DELETE FROM disponibilidad d WHERE d.especialista_id = ANY(:ids) "
        "AND NOT EXISTS (SELECT 1 FROM citas c WHERE c.disponibilidad_id = d.id) "
        "AND NOT EXISTS (SELECT 1 FROM ofertas_espera o WHERE o.disponibilidad_id = d.id)"
    ), {"ids": ids})
    sin_citas = [i for (i,) in conexion.execute(sa.text(
        "SELECT e.id FROM especialistas e WHERE e.id = ANY(:ids) "
        "AND NOT EXISTS (SELECT 1 FROM disponibilidad d WHERE d.especialista_id = e.id)"
    ), {"ids": ids})]
    for tabla in ("turnos_especialista", "especialista_modalidades", "especialista_sedes"):
        conexion.execute(sa.text(f"DELETE FROM {tabla} WHERE especialista_id = ANY(:ids)"), {"ids": sin_citas})
    conexion.execute(sa.text("DELETE FROM especialistas WHERE id = ANY(:ids)"), {"ids": sin_citas})

    conexion.execute(sa.text("DELETE FROM farmacias WHERE nombre = ANY(:n)"), {"n": [f[0] for f in FARMACIAS]})
    # Solo las que nadie usa (médicos, horarios, listas de espera, peticiones o farmacias).
    conexion.execute(sa.text(
        "DELETE FROM sedes s WHERE s.nombre = ANY(:n) "
        "AND NOT EXISTS (SELECT 1 FROM especialista_sedes x WHERE x.sede_id = s.id) "
        "AND NOT EXISTS (SELECT 1 FROM turnos_especialista t WHERE t.sede_id = s.id) "
        "AND NOT EXISTS (SELECT 1 FROM disponibilidad d WHERE d.sede_id = s.id) "
        "AND NOT EXISTS (SELECT 1 FROM farmacias f WHERE f.sede_id = s.id) "
        "AND NOT EXISTS (SELECT 1 FROM solicitud_espera_sedes l WHERE l.sede_id = s.id)"
    ), {"n": [s[0] for s in SEDES]})
    conexion.execute(sa.text(
        "DELETE FROM especialidades e WHERE e.nombre = ANY(:n) "
        "AND NOT EXISTS (SELECT 1 FROM especialistas x WHERE x.especialidad_id = e.id) "
        "AND NOT EXISTS (SELECT 1 FROM solicitudes_espera l WHERE l.especialidad_id = e.id) "
        "AND NOT EXISTS (SELECT 1 FROM solicitudes_cita c WHERE c.especialidad_id = e.id)"
    ), {"n": CON_MEDICOS + SIN_MEDICOS})
