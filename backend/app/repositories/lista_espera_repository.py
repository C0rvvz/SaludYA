"""Acceso a datos de la lista de espera — HU-19, HU-31, HU-32 (paciente) y HU-45, HU-53 a HU-61 (personal)."""

import uuid
from datetime import datetime, time

from sqlalchemy import and_, case, exists, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.disponibilidad import Disponibilidad, EstadoDisponibilidad
from app.models.especialista import Especialista
from app.models.lista_espera import (
    EstadoOferta,
    EstadoSolicitud,
    Jornada,
    OfertaEspera,
    PrioridadMedica,
    SolicitudEspera,
)

ACTIVAS = (EstadoSolicitud.EN_ESPERA, EstadoSolicitud.CUPO_OFRECIDO)

# HU-19: orden de la lista, primero por prioridad médica y luego por antigüedad.
_ORDEN_PRIORIDAD = case(
    {PrioridadMedica.URGENTE: 0, PrioridadMedica.ALTA: 1, PrioridadMedica.NORMAL: 2},
    value=SolicitudEspera.prioridad,
)
ORDEN = (_ORDEN_PRIORIDAD, SolicitudEspera.creado_en)

MEDIODIA = time(12, 0)  # HU-55: "mañana" es antes del mediodía


def obtener(db: Session, solicitud_id: uuid.UUID) -> SolicitudEspera | None:
    return db.get(SolicitudEspera, solicitud_id)


def obtener_con_lock(db: Session, solicitud_id: uuid.UUID) -> SolicitudEspera | None:
    return db.query(SolicitudEspera).filter(SolicitudEspera.id == solicitud_id).with_for_update().first()


def activa_de(db: Session, paciente_id: uuid.UUID, especialidad_id: uuid.UUID) -> SolicitudEspera | None:
    return (
        db.query(SolicitudEspera)
        .filter(
            SolicitudEspera.paciente_id == paciente_id,
            SolicitudEspera.especialidad_id == especialidad_id,
            SolicitudEspera.estado.in_(ACTIVAS),
        )
        .first()
    )


def del_paciente(db: Session, paciente_id: uuid.UUID) -> list[SolicitudEspera]:
    """Las del paciente que no canceló, de la más reciente a la más antigua."""
    return (
        db.query(SolicitudEspera)
        .options(selectinload(SolicitudEspera.sedes), selectinload(SolicitudEspera.ofertas))
        .filter(SolicitudEspera.paciente_id == paciente_id, SolicitudEspera.estado != EstadoSolicitud.CANCELADA)
        .order_by(SolicitudEspera.creado_en.desc())
        .all()
    )


def ids_en_orden(db: Session, especialidad_id: uuid.UUID) -> list[uuid.UUID]:
    """HU-19: la fila de una especialidad (solicitudes activas), en orden."""
    filas = (
        db.query(SolicitudEspera.id)
        .filter(SolicitudEspera.especialidad_id == especialidad_id, SolicitudEspera.estado.in_(ACTIVAS))
        .order_by(*ORDEN)
        .all()
    )
    return [f[0] for f in filas]


def en_espera_para_ofrecer(db: Session) -> list[SolicitudEspera]:
    """Las que esperan cupo, en orden de la lista (bloqueadas: dos pasadas no ofrecen dos veces)."""
    return (
        db.query(SolicitudEspera)
        .filter(SolicitudEspera.estado == EstadoSolicitud.EN_ESPERA)
        .order_by(*ORDEN)
        .with_for_update(skip_locked=True)
        .all()
    )


def _compatibles(db: Session, solicitud: SolicitudEspera, desde: datetime):
    """
    HU-31 criterio 2 / HU-55 criterio 1: horarios libres que coinciden con
    la solicitud (especialidad, sedes, jornada y modalidad) y que empiezan
    después de `desde` (hora de Colombia), del más próximo al más lejano.
    """
    query = (
        db.query(Disponibilidad)
        .join(Disponibilidad.especialista)
        .filter(
            Especialista.especialidad_id == solicitud.especialidad_id,
            Disponibilidad.estado == EstadoDisponibilidad.DISPONIBLE,
            Disponibilidad.sede_id.in_([s.id for s in solicitud.sedes]),
            or_(
                Disponibilidad.fecha > desde.date(),
                and_(Disponibilidad.fecha == desde.date(), Disponibilidad.hora > desde.time()),
            ),
        )
    )
    if solicitud.modalidad is not None:
        query = query.filter(Disponibilidad.modalidad == solicitud.modalidad)
    if solicitud.jornada == Jornada.MANANA:
        query = query.filter(Disponibilidad.hora < MEDIODIA)
    elif solicitud.jornada == Jornada.TARDE:
        query = query.filter(Disponibilidad.hora >= MEDIODIA)
    return query.order_by(Disponibilidad.fecha, Disponibilidad.hora)


def primera_franja_compatible(db: Session, solicitud: SolicitudEspera, desde: datetime) -> Disponibilidad | None:
    """La primera compatible que no se le haya ofrecido antes (bloqueada para ofrecerla)."""
    ya_ofrecida = exists().where(
        OfertaEspera.solicitud_id == solicitud.id,
        OfertaEspera.disponibilidad_id == Disponibilidad.id,
    )
    return (
        _compatibles(db, solicitud, desde)
        .filter(~ya_ofrecida)
        .with_for_update(of=Disponibilidad, skip_locked=True)
        .first()
    )


def franjas_compatibles(db: Session, solicitud: SolicitudEspera, desde: datetime, limite: int = 30) -> list[Disponibilidad]:
    """HU-59: opciones para que el personal confirme la cita (incluye las que el paciente ya rechazó)."""
    return _compatibles(db, solicitud, desde).limit(limite).all()


def para_personal(db: Session, desde: datetime, hasta: datetime) -> list[SolicitudEspera]:
    """HU-45 / HU-53: las que estuvieron en la lista en ese rango (creadas antes del fin y no cerradas antes del inicio)."""
    return (
        db.query(SolicitudEspera)
        .options(
            joinedload(SolicitudEspera.paciente),
            joinedload(SolicitudEspera.especialidad),
            selectinload(SolicitudEspera.sedes),
            selectinload(SolicitudEspera.ofertas).joinedload(OfertaEspera.disponibilidad),
        )
        .filter(
            SolicitudEspera.creado_en < hasta,
            or_(SolicitudEspera.cerrada_en.is_(None), SolicitudEspera.cerrada_en >= desde),
        )
        .order_by(*ORDEN)
        .all()
    )


def cuenta_activas(db: Session) -> int:
    """HU-52: pacientes que esperan cupo en este momento."""
    return db.query(SolicitudEspera).filter(SolicitudEspera.estado.in_(ACTIVAS)).count()


def ofertas_vencidas(db: Session, ahora: datetime) -> list[OfertaEspera]:
    return (
        db.query(OfertaEspera)
        .filter(OfertaEspera.estado == EstadoOferta.PENDIENTE, OfertaEspera.expira_en <= ahora)
        .with_for_update(skip_locked=True)
        .all()
    )


def oferta_pendiente_con_lock(db: Session, solicitud_id: uuid.UUID) -> OfertaEspera | None:
    """
    La oferta vigente, bloqueada: si la tarea de fondo la está venciendo
    en ese momento, se espera y se relee (y ya no aparece como pendiente).
    """
    return (
        db.query(OfertaEspera)
        .filter(OfertaEspera.solicitud_id == solicitud_id, OfertaEspera.estado == EstadoOferta.PENDIENTE)
        .with_for_update()
        .first()
    )
