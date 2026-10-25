"""
IPS simulada — RNF "el aplicativo mantendrá actualizada la base de datos
de los especialistas".

En la realidad, cada IPS le manda a la EPS su lista de especialistas y
sus agendas. Aquí se simula esa actualización cada CADA_DIAS días (la
tarea de fondo) o cuando el administrador la pide desde "Especialistas":

- Llegan 1 o 2 especialistas nuevos, con nombre, registro médico,
  especialidad (más médicos generales y pediatras, como en la realidad) y
  un horario semanal realista: un turno por día (mañana o tarde), en una
  o dos sedes, a veces el sábado en la mañana y a veces virtual.
- A veces uno que había llegado por la IPS deja de atender en la red: se
  desactiva y sus citas ya agendadas se conservan. Los del catálogo
  inicial y los que agregó el personal nunca se retiran solos.
- Se genera la agenda de todos para los próximos 10 días hábiles.

Cada actualización queda en sincronizaciones_ips y en la auditoría.
"""

import random
from datetime import datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.auditoria import TipoActor
from app.models.especialidad import Especialidad
from app.models.especialista import Especialista, Modalidad
from app.models.personal import Personal
from app.models.sede import Sede
from app.models.sincronizacion_ips import SincronizacionIps
from app.services import auditoria_service, disponibilidad_service, especialistas_service
from app.services.auditoria_service import Actor
from app.services.especialistas_service import TurnoDatos
from app.services.seguridad_service import nombre_personal

CADA_DIAS = 10
MAX_ACTIVOS = 14  # para que la red no crezca sin fin

IPS = Actor(TipoActor.SISTEMA, None, "IPS (actualización simulada)")

NOMBRES = [
    ("Dra.", "Paula Andrea Restrepo"), ("Dr.", "Juan Camilo Echeverri"), ("Dra.", "Natalia Ospina Vélez"),
    ("Dr.", "Santiago Mejía Arango"), ("Dra.", "Catalina Zapata Ríos"), ("Dr.", "Felipe Montoya"),
    ("Dra.", "Daniela Cárdenas"), ("Dr.", "Mauricio Gaviria"), ("Dra.", "Laura Valentina Henao"),
    ("Dr.", "Sebastián Londoño"), ("Dra.", "Juliana Correa Mesa"), ("Dr.", "Alejandro Vásquez"),
    ("Dra.", "Mónica Betancur"), ("Dr.", "Esteban Rendón"), ("Dra.", "Carolina Muñoz"),
    ("Dr.", "Jorge Iván Cardona"), ("Dra.", "Sara Builes"), ("Dr.", "Ricardo Posada"),
    ("Dra.", "Valeria Arango Toro"), ("Dr.", "Camilo Agudelo"),
]
PESO_ESPECIALIDAD = {"Médico general": 3, "Pediatría": 2}  # las demás pesan 1
DURACION_ESPECIALIDAD = {"Cardiología": 30}  # las demás, 20 minutos
BLOQUES = [(time(7, 0), time(12, 0)), (time(8, 0), time(12, 0)), (time(13, 0), time(17, 0)), (time(14, 0), time(18, 0))]
SABADO = 5


def _turnos_al_azar(rng: random.Random, sedes: list[Sede], duracion: int) -> list[TurnoDatos]:
    """Un turno por día (nunca se cruzan), de lunes a viernes y a veces el sábado en la mañana."""
    donde = rng.sample(sedes, k=min(len(sedes), rng.choice([1, 1, 2])))
    dias = sorted(rng.sample(range(5), k=rng.randint(3, 4)))
    if rng.random() < 0.3:
        dias.append(SABADO)
    turnos = []
    for i, dia in enumerate(dias):
        inicio, fin = (time(8, 0), time(12, 0)) if dia == SABADO else rng.choice(BLOQUES)
        virtual = dia != SABADO and rng.random() < 0.15
        turnos.append(TurnoDatos(
            dia, donde[i % len(donde)].id, Modalidad.VIRTUAL if virtual else Modalidad.PRESENCIAL,
            inicio, fin, duracion,
        ))
    return turnos


def _llegan_nuevos(db: Session, rng: random.Random, cuantos: int) -> list[Especialista]:
    existentes = {nombre.lower() for (nombre,) in db.query(Especialista.nombre).all()}
    libres = [(t, n) for t, n in NOMBRES if f"{t} {n}".lower() not in existentes]
    especialidades = db.query(Especialidad).order_by(Especialidad.nombre).all()
    sedes = db.query(Sede).order_by(Sede.nombre).all()
    nuevos = []
    for tratamiento, nombre in rng.sample(libres, k=min(cuantos, len(libres))):
        especialidad = rng.choices(especialidades, weights=[PESO_ESPECIALIDAD.get(e.nombre, 1) for e in especialidades])[0]
        turnos = _turnos_al_azar(rng, sedes, DURACION_ESPECIALIDAD.get(especialidad.nombre, 20))
        nuevos.append(especialistas_service.crear(
            db, IPS, tratamiento, nombre, especialidad.id, f"05-{rng.randint(100000, 199999)}", turnos,
            origen="ips", generar_agenda=False,  # la agenda de todos se genera al final
        ))
    return nuevos


def sincronizar(db: Session, quien: Personal | None, rng: random.Random | None = None) -> SincronizacionIps:
    """Una actualización de la IPS. `quien`: el administrador que la pidió (None = la automática)."""
    rng = rng or random.Random()
    activos = db.query(Especialista).filter(Especialista.activo.is_(True)).all()

    retirados = []
    de_la_ips = [e for e in activos if e.origen == "ips"]
    if de_la_ips and (len(activos) >= MAX_ACTIVOS or rng.random() < 0.3):
        retirado = rng.choice(de_la_ips)
        especialistas_service.cambiar_estado(db, IPS, retirado.id, activo=False)
        retirados.append(retirado)

    cuantos = 0 if len(activos) - len(retirados) >= MAX_ACTIVOS else rng.randint(1, 2)
    nuevos = _llegan_nuevos(db, rng, cuantos)
    tanda = disponibilidad_service.generar_franjas(db)

    partes = []
    if nuevos:
        partes.append("Llegaron: " + ", ".join(f"{e.nombre} ({e.especialidad.nombre})" for e in nuevos))
    if retirados:
        partes.append("Dejó de atender en la red: " + ", ".join(e.nombre for e in retirados))
    sincronizacion = SincronizacionIps(
        origen="manual" if quien else "automatica",
        solicitada_por=nombre_personal(quien) if quien else None,
        especialistas_nuevos=len(nuevos),
        especialistas_retirados=len(retirados),
        franjas_creadas=tanda.creadas,
        desde=tanda.desde,
        hasta=tanda.hasta,
        detalle=". ".join(partes) + "." if partes else "Sin cambios en la lista de especialistas.",
    )
    db.add(sincronizacion)
    auditoria_service.registrar(
        db, Actor.de_personal(quien) if quien else IPS, "sincronizar_ips",
        f"Actualizó los especialistas desde la IPS: {len(nuevos)} nuevos, {len(retirados)} retirados y "
        f"{tanda.creadas} horarios nuevos",
        detalle=sincronizacion.detalle,
    )
    db.commit()
    db.refresh(sincronizacion)
    return sincronizacion


def ultima(db: Session) -> SincronizacionIps | None:
    return db.query(SincronizacionIps).order_by(SincronizacionIps.fecha.desc()).first()


def proxima_automatica(db: Session) -> datetime:
    anterior = ultima(db)
    return (anterior.fecha if anterior else datetime.now(timezone.utc)) + timedelta(days=CADA_DIAS)


def sincronizar_si_corresponde(db: Session) -> SincronizacionIps | None:
    """Tarea de fondo: la actualización automática, si ya pasaron CADA_DIAS días desde la última."""
    anterior = ultima(db)
    if anterior is not None and datetime.now(timezone.utc) - anterior.fecha < timedelta(days=CADA_DIAS):
        return None
    return sincronizar(db, None)


def historial(db: Session, limite: int = 10) -> list[SincronizacionIps]:
    return db.query(SincronizacionIps).order_by(SincronizacionIps.fecha.desc()).limit(limite).all()
