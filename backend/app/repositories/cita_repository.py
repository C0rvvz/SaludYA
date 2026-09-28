"""Acceso a datos de Cita — HU-16, HU-17, HU-20, HU-21, HU-22, HU-26, HU-33."""

import uuid
from datetime import date

from sqlalchemy import or_
from sqlalchemy.orm import Session, contains_eager, joinedload

from app.models.cita import Cita, EstadoCita
from app.models.disponibilidad import Disponibilidad
from app.models.especialista import Especialista
from app.models.paciente import Paciente


def crear_cita(db: Session, cita: Cita) -> Cita:
    db.add(cita)
    db.commit()
    db.refresh(cita)
    return cita


def obtener_por_id(db: Session, cita_id: uuid.UUID) -> Cita | None:
    return (
        db.query(Cita)
        .options(
            joinedload(Cita.paciente),
            joinedload(Cita.disponibilidad)
            .joinedload(Disponibilidad.especialista)
            .joinedload(Especialista.especialidad),
            joinedload(Cita.disponibilidad).joinedload(Disponibilidad.sede),
        )
        .filter(Cita.id == cita_id)
        .first()
    )


def obtener_con_lock(db: Session, cita_id: uuid.UUID) -> Cita | None:
    """
    SELECT ... FOR UPDATE sobre la cita (sin joins: FOR UPDATE no admite
    el lado opcional de un LEFT JOIN). Se usa al confirmar asistencia,
    cancelar o reprogramar, para que dos acciones simultáneas sobre la
    misma cita se apliquen una después de la otra.
    """
    return db.query(Cita).filter(Cita.id == cita_id).with_for_update().first()


def listar_por_paciente(db: Session, paciente_id: uuid.UUID) -> list[Cita]:
    """
    Todas las citas de un paciente, en cualquier estado, de la más
    próxima a la más lejana (HU-26 "Mis citas", HU-27, HU-29, HU-33).
    """
    return (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .options(
            contains_eager(Cita.disponibilidad)
            .joinedload(Disponibilidad.especialista)
            .joinedload(Especialista.especialidad),
            contains_eager(Cita.disponibilidad).joinedload(Disponibilidad.sede),
        )
        .filter(Cita.paciente_id == paciente_id)
        .order_by(Disponibilidad.fecha, Disponibilidad.hora)
        .all()
    )


def _escapar_like(texto: str) -> str:
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def listar_para_personal(
    db: Session,
    desde: date | None = None,
    hasta: date | None = None,
    especialidad_id: uuid.UUID | None = None,
    texto: str | None = None,
    limite: int = 500,
) -> list[Cita]:
    """
    HU-34: citas de todos los pacientes para el personal, ordenadas por
    fecha y hora. `texto` busca por nombre del paciente, número de
    documento o número de comprobante.
    """
    query = (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .join(Disponibilidad.especialista)
        .join(Cita.paciente)
        .options(
            contains_eager(Cita.disponibilidad)
            .contains_eager(Disponibilidad.especialista)
            .joinedload(Especialista.especialidad),
            contains_eager(Cita.disponibilidad).joinedload(Disponibilidad.sede),
            contains_eager(Cita.paciente),
        )
    )
    if desde is not None:
        query = query.filter(Disponibilidad.fecha >= desde)
    if hasta is not None:
        query = query.filter(Disponibilidad.fecha <= hasta)
    if especialidad_id is not None:
        query = query.filter(Especialista.especialidad_id == especialidad_id)
    if texto and texto.strip():
        patron = _escapar_like(texto.strip())
        query = query.filter(
            or_(
                Paciente.nombre.ilike(f"%{patron}%", escape="\\"),
                Paciente.numero_documento.ilike(f"{patron}%", escape="\\"),
                Cita.numero_comprobante.ilike(f"%{patron}%", escape="\\"),
            )
        )
    return query.order_by(Disponibilidad.fecha, Disponibilidad.hora).limit(limite).all()


def listar_por_pacientes(db: Session, paciente_ids: set[uuid.UUID]) -> list[Cita]:
    """Todas las citas de varios pacientes (historial para estimar el riesgo, HU-34/HU-35)."""
    if not paciente_ids:
        return []
    return (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .options(contains_eager(Cita.disponibilidad))
        .filter(Cita.paciente_id.in_(paciente_ids))
        .order_by(Disponibilidad.fecha, Disponibilidad.hora)
        .all()
    )


def por_cerrar(db: Session, hasta_fecha: date) -> list[Cita]:
    """
    HU-25: citas todavía "confirmadas" cuya fecha ya llegó (el servicio
    filtra por hora exacta). Con SKIP LOCKED, igual que los recordatorios.
    """
    return (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .options(contains_eager(Cita.disponibilidad))
        .filter(Cita.estado == EstadoCita.CONFIRMADA, Disponibilidad.fecha <= hasta_fecha)
        .with_for_update(of=Cita, skip_locked=True)
        .all()
    )


def pendientes_de_recordatorio(
    db: Session, desde: date, hasta: date, max_intentos: int
) -> list[Cita]:
    """
    HU-22: citas activas, sin recordatorio enviado, con intentos
    disponibles y cuya fecha cae entre `desde` y `hasta` (el servicio
    filtra luego por hora exacta).

    FOR UPDATE SKIP LOCKED sobre las citas: si algún día corren varios
    procesos de la API, cada cita la toma uno solo y nadie recibe el
    mismo recordatorio dos veces.
    """
    return (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .options(
            contains_eager(Cita.disponibilidad)
            .joinedload(Disponibilidad.especialista)
            .joinedload(Especialista.especialidad),
            contains_eager(Cita.disponibilidad).joinedload(Disponibilidad.sede),
            joinedload(Cita.paciente),
        )
        .filter(
            Cita.estado == EstadoCita.CONFIRMADA,
            Cita.recordatorio_enviado_en.is_(None),
            Cita.recordatorio_intentos < max_intentos,
            Disponibilidad.fecha >= desde,
            Disponibilidad.fecha <= hasta,
        )
        .with_for_update(of=Cita, skip_locked=True)
        .all()
    )
