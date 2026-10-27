"""
Especialistas en el panel del personal: agregarlos con su horario
semanal, cambiarles el horario y desactivarlos o activarlos. La IPS
simulada (ips_simulada_service) usa las mismas funciones.

- Los turnos de un mismo día no se pueden cruzar, aunque sean en sedes o
  modalidades distintas: un especialista no está en dos lugares a la vez.
- Sus sedes y modalidades salen de sus turnos (las usan la búsqueda de
  citas y la lista de espera).
- Al cambiar el horario o desactivarlo, sus horarios futuros libres se
  quitan; las citas ya agendadas se conservan (el personal decide si las
  reprograma). Con el horario nuevo, o al activarlo, se genera su agenda.
- Cada cambio queda en la auditoría.
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import time

from sqlalchemy import delete, func, insert
from sqlalchemy.orm import Session, selectinload

from app.models.cita import Cita
from app.models.disponibilidad import Disponibilidad, EstadoDisponibilidad
from app.models.eps import Eps
from app.models.especialista import Especialista, Modalidad, TurnoEspecialista, especialista_modalidades
from app.repositories import especialidad_repository, sede_repository
from app.services import auditoria_service, citas_service, disponibilidad_service
from app.services.auditoria_service import Actor
from app.services.exceptions import EspecialistaInvalidoError
from app.utils.tiempo import hoy_en_colombia

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
DURACIONES = (15, 20, 30, 40, 60)  # minutos de cada cita
PRIMERA_HORA, ULTIMA_HORA = time(6, 0), time(20, 0)
TRATAMIENTOS = ("Dr.", "Dra.")


@dataclass(frozen=True)
class TurnoDatos:
    dia_semana: int
    sede_id: uuid.UUID
    modalidad: Modalidad
    hora_inicio: time
    hora_fin: time
    duracion_minutos: int


def _minutos(hora: time) -> int:
    return hora.hour * 60 + hora.minute


def validar_turnos(db: Session, turnos: list[TurnoDatos]) -> None:
    if not turnos:
        raise EspecialistaInvalidoError("Agregue al menos un turno al horario.")
    sedes = {s.id for s in sede_repository.por_ids(db, {t.sede_id for t in turnos}) if s.activa}
    por_dia: dict[int, list[TurnoDatos]] = defaultdict(list)
    for t in turnos:
        if not 0 <= t.dia_semana <= 5:
            raise EspecialistaInvalidoError("Los turnos van de lunes a sábado.")
        dia = DIAS[t.dia_semana]
        if t.sede_id not in sedes:
            raise EspecialistaInvalidoError(f"La sede del turno del {dia} no existe o está cerrada.")
        if t.duracion_minutos not in DURACIONES:
            raise EspecialistaInvalidoError("Cada cita dura 15, 20, 30, 40 o 60 minutos.")
        if t.hora_inicio < PRIMERA_HORA or t.hora_fin > ULTIMA_HORA:
            raise EspecialistaInvalidoError("Los turnos van entre las 6:00 a. m. y las 8:00 p. m.")
        if _minutos(t.hora_fin) - _minutos(t.hora_inicio) < t.duracion_minutos:
            raise EspecialistaInvalidoError(f"El turno del {dia} termina antes de que quepa una cita.")
        por_dia[t.dia_semana].append(t)
    for dia, del_dia in por_dia.items():
        del_dia.sort(key=lambda t: t.hora_inicio)
        for antes, despues in zip(del_dia, del_dia[1:]):
            if antes.hora_fin > despues.hora_inicio:
                raise EspecialistaInvalidoError(
                    f"Los turnos del {DIAS[dia]} se cruzan: el especialista no puede estar en dos lugares a la vez."
                )


def _aplicar_turnos(db: Session, especialista: Especialista, turnos: list[TurnoDatos]) -> None:
    """Reemplaza su horario; sus sedes y modalidades salen de los turnos."""
    especialista.turnos = [
        TurnoEspecialista(
            dia_semana=t.dia_semana, sede_id=t.sede_id, modalidad=t.modalidad,
            hora_inicio=t.hora_inicio, hora_fin=t.hora_fin, duracion_minutos=t.duracion_minutos,
        )
        for t in turnos
    ]
    especialista.sedes = sede_repository.por_ids(db, {t.sede_id for t in turnos})
    db.flush()
    db.execute(delete(especialista_modalidades).where(especialista_modalidades.c.especialista_id == especialista.id))
    db.execute(insert(especialista_modalidades).values([
        {"especialista_id": especialista.id, "modalidad": m} for m in sorted({t.modalidad for t in turnos})
    ]))


def _obtener(db: Session, especialista_id: uuid.UUID) -> Especialista:
    especialista = db.get(Especialista, especialista_id)
    if especialista is None:
        raise EspecialistaInvalidoError("No existe ese especialista.")
    return especialista


def crear(
    db: Session,
    actor: Actor,
    tratamiento: str,
    nombre: str,
    especialidad_id: uuid.UUID,
    eps_id: uuid.UUID,
    registro_medico: str | None,
    turnos: list[TurnoDatos],
    origen: str = "manual",
    generar_agenda: bool = True,
) -> Especialista:
    """`generar_agenda`: False si quien lo llama genera después la de todos (la IPS simulada)."""
    nombre = " ".join(nombre.split())
    if tratamiento not in TRATAMIENTOS or not nombre:
        raise EspecialistaInvalidoError("Escriba el nombre y elija «Dr.» o «Dra.».")
    especialidad = especialidad_repository.obtener_por_id(db, especialidad_id)
    if especialidad is None:
        raise EspecialistaInvalidoError("No existe esa especialidad.")
    eps = db.get(Eps, eps_id)
    if eps is None:
        raise EspecialistaInvalidoError("Elija la EPS de cuyos afiliados es médico.")
    completo = f"{tratamiento} {nombre}"
    if db.query(Especialista).filter(func.lower(Especialista.nombre) == completo.lower()).first():
        raise EspecialistaInvalidoError(f"Ya existe un especialista llamado {completo}.")
    registro_medico = (registro_medico or "").strip() or None
    if registro_medico and db.query(Especialista).filter(Especialista.registro_medico == registro_medico).first():
        raise EspecialistaInvalidoError(f"El registro médico {registro_medico} ya es de otro especialista.")
    validar_turnos(db, turnos)

    especialista = Especialista(
        nombre=completo, especialidad_id=especialidad.id, eps_id=eps.id, registro_medico=registro_medico, origen=origen
    )
    db.add(especialista)
    db.flush()
    _aplicar_turnos(db, especialista, turnos)
    auditoria_service.registrar(
        db, actor, "crear_especialista",
        f"Agregó a {completo} ({especialidad.nombre}, {eps.nombre}) con {len(turnos)} turnos a la semana",
    )
    db.commit()
    if generar_agenda:
        disponibilidad_service.generar_franjas(db, especialistas=[especialista])
    db.refresh(especialista)
    return especialista


def cambiar_horario(db: Session, actor: Actor, especialista_id: uuid.UUID, turnos: list[TurnoDatos]) -> Especialista:
    especialista = _obtener(db, especialista_id)
    validar_turnos(db, turnos)
    disponibilidad_service.liberar_futuras(db, especialista.id)
    _aplicar_turnos(db, especialista, turnos)
    auditoria_service.registrar(
        db, actor, "editar_especialista", f"Cambió el horario de {especialista.nombre}",
        detalle=f"{len(turnos)} turnos a la semana. Las citas ya agendadas se conservan.",
    )
    db.commit()
    disponibilidad_service.generar_franjas(db, especialistas=[especialista])
    db.refresh(especialista)
    return especialista


def citas_proximas(db: Session, especialista_id: uuid.UUID) -> int:
    citas = (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .filter(Disponibilidad.especialista_id == especialista_id, Disponibilidad.fecha >= hoy_en_colombia())
        .all()
    )
    return sum(1 for c in citas if citas_service.esta_activa(c))


def cambiar_estado(db: Session, actor: Actor, especialista_id: uuid.UUID, activo: bool) -> Especialista:
    especialista = _obtener(db, especialista_id)
    if especialista.activo == activo:
        return especialista
    especialista.activo = activo
    if activo:
        auditoria_service.registrar(db, actor, "activar_especialista", f"Activó a {especialista.nombre}")
    else:
        disponibilidad_service.liberar_futuras(db, especialista.id)
        conserva = citas_proximas(db, especialista.id)
        auditoria_service.registrar(
            db, actor, "desactivar_especialista", f"Desactivó a {especialista.nombre}",
            detalle=f"Conserva {conserva} citas ya agendadas" if conserva else None,
        )
    db.commit()
    if activo:
        disponibilidad_service.generar_franjas(db, especialistas=[especialista])
    db.refresh(especialista)
    return especialista


def _cupos_libres(db: Session) -> dict[uuid.UUID, int]:
    return dict(
        db.query(Disponibilidad.especialista_id, func.count())
        .filter(Disponibilidad.fecha > hoy_en_colombia(), Disponibilidad.estado == EstadoDisponibilidad.DISPONIBLE)
        .group_by(Disponibilidad.especialista_id)
        .all()
    )


def datos(db: Session, e: Especialista, libres: dict[uuid.UUID, int] | None = None) -> dict:
    """Lo que ve el personal de un especialista: su horario, sus cupos libres y sus citas próximas."""
    if libres is None:
        libres = _cupos_libres(db)
    return {
        "id": e.id,
        "nombre": e.nombre,
        "especialidad_id": e.especialidad_id,
        "especialidad": e.especialidad.nombre,
        "eps_id": e.eps_id,
        "eps": e.eps.nombre,
        "eps_corto": e.eps.nombre_corto,
        "registro_medico": e.registro_medico,
        "activo": e.activo,
        "origen": e.origen,
        "creado_en": e.creado_en,
        "sedes": sorted({t.sede.nombre for t in e.turnos}),
        "turnos": [
            {
                "dia_semana": t.dia_semana,
                "sede_id": t.sede_id,
                "sede": t.sede.nombre,
                "modalidad": t.modalidad,
                "hora_inicio": t.hora_inicio,
                "hora_fin": t.hora_fin,
                "duracion_minutos": t.duracion_minutos,
            }
            for t in e.turnos
        ],
        "cupos_libres": libres.get(e.id, 0),
        "citas_proximas": citas_proximas(db, e.id),
    }


def listar(db: Session) -> list[dict]:
    """Todos (activos primero)."""
    libres = _cupos_libres(db)
    especialistas = (
        db.query(Especialista)
        .options(selectinload(Especialista.turnos).selectinload(TurnoEspecialista.sede))
        .order_by(Especialista.activo.desc(), Especialista.nombre)
        .all()
    )
    return [datos(db, e, libres) for e in especialistas]


def turnos_desde(turnos) -> list[TurnoDatos]:
    """De lo que llega en la petición (schemas.especialistas.TurnoIn) a TurnoDatos."""
    return [
        TurnoDatos(t.dia_semana, t.sede_id, t.modalidad, t.hora_inicio, t.hora_fin, t.duracion_minutos)
        for t in turnos
    ]

