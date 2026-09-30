"""Acceso a datos de la lista de espera — HU-19, HU-31, HU-32."""

import uuid
from datetime import datetime, time

from sqlalchemy import and_, case, exists, or_
from sqlalchemy.orm import Session, selectinload

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


def primera_franja_compatible(db: Session, solicitud: SolicitudEspera, desde: datetime) -> Disponibilidad | None:
    """
    HU-31, criterio 2: el primer horario libre que coincide con la
    solicitud (especialidad, sedes, jornada y modalidad), que empieza
    después de `desde` (hora de Colombia) y que no se le haya ofrecido antes.
    """
    ya_ofrecida = exists().where(
        OfertaEspera.solicitud_id == solicitud.id,
        OfertaEspera.disponibilidad_id == Disponibilidad.id,
    )
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
            ~ya_ofrecida,
        )
    )
    if solicitud.modalidad is not None:
        query = query.filter(Disponibilidad.modalidad == solicitud.modalidad)
    if solicitud.jornada == Jornada.MANANA:
        query = query.filter(Disponibilidad.hora < MEDIODIA)
    elif solicitud.jornada == Jornada.TARDE:
        query = query.filter(Disponibilidad.hora >= MEDIODIA)
    return (
        query.order_by(Disponibilidad.fecha, Disponibilidad.hora)
        .with_for_update(of=Disponibilidad, skip_locked=True)
        .first()
    )


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
