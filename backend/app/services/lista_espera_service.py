"""
Lista de espera del paciente — HU-19, HU-31 y HU-32.

- unirse(): el paciente pide una cita de una especialidad, con sus
  preferencias de jornada, sedes y modalidad, y el canal para avisarle.
- asignar_cupos(): HU-31. Recorre las solicitudes en espera en el orden
  de la lista (prioridad médica y luego antigüedad); a cada una le busca
  el primer horario libre compatible, se lo reserva por
  LISTA_ESPERA_PLAZO_MINUTOS y le avisa por su canal. Corre al unirse,
  justo después de cada cancelación o reprogramación (citas_service) y
  en cada pasada de la tarea de fondo, que antes vence las ofertas sin
  respuesta.
- aceptar() / rechazar(): HU-32.
- posición: HU-19, calculada en cada consulta.

SUPUESTO: se ofrece cualquier horario libre compatible, no solo los que
se liberan por una cancelación: también los que genera
disponibilidad_service. Si al unirse ya hay uno, se ofrece de inmediato.
SUPUESTO: solo se ofrecen horarios que empiezan después del plazo para
responder, para que el paciente siempre tenga el plazo completo.
SUPUESTO: si el paciente no responde a tiempo, la oferta vence, él
conserva su lugar en la lista y el cupo pasa al siguiente (igual que si
lo rechaza).
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import CanalContacto
from app.models.disponibilidad import EstadoDisponibilidad
from app.models.especialista import Modalidad
from app.models.lista_espera import (
    EstadoOferta,
    EstadoSolicitud,
    Jornada,
    OfertaEspera,
    SolicitudEspera,
)
from app.models.paciente import Paciente
from app.repositories import especialidad_repository, lista_espera_repository as repo, sede_repository
from app.services import auditoria_service, citas_service, comprobante_service
from app.services.auditoria_service import SISTEMA, Actor
from app.services.exceptions import ListaEsperaInvalidaError
from app.utils.tiempo import ZONA_COLOMBIA, ahora_colombia, fecha_legible, hora_legible

logger = logging.getLogger("saludya.lista_espera")


def _plazo() -> timedelta:
    return timedelta(minutes=settings.lista_espera_plazo_minutos)


def _cuando(momento: datetime) -> str:
    local = momento.astimezone(ZONA_COLOMBIA)
    return f"{fecha_legible(local.date())} a las {hora_legible(local.time())}"


def unirse(
    db: Session,
    paciente: Paciente,
    especialidad_id: uuid.UUID,
    sede_ids: list[uuid.UUID],
    jornada: Jornada,
    modalidad: Modalidad | None,
    canal: CanalContacto,
) -> SolicitudEspera:
    especialidad = especialidad_repository.obtener_por_id(db, especialidad_id)
    if especialidad is None:
        raise ListaEsperaInvalidaError("No existe esa especialidad.")
    sedes = sede_repository.por_ids(db, set(sede_ids))
    if not sedes or len(sedes) != len(set(sede_ids)):
        raise ListaEsperaInvalidaError("Elija al menos una sede.")
    if repo.activa_de(db, paciente.id, especialidad_id):
        raise ListaEsperaInvalidaError(f"Usted ya está en la lista de espera de {especialidad.nombre}.")

    solicitud = SolicitudEspera(
        paciente_id=paciente.id,
        especialidad_id=especialidad_id,
        jornada=jornada,
        modalidad=modalidad,
        canal=canal,
        sedes=sedes,
    )
    db.add(solicitud)
    auditoria_service.registrar(
        db, Actor.de_paciente(paciente), "unirse_lista_espera",
        f"Se unió a la lista de espera de {especialidad.nombre}", paciente_id=paciente.id,
    )
    try:
        db.commit()
    except IntegrityError:  # dos envíos casi al mismo tiempo: el índice único deja pasar uno
        db.rollback()
        raise ListaEsperaInvalidaError(f"Usted ya está en la lista de espera de {especialidad.nombre}.")

    asignar_cupos(db)  # si ya hay un horario compatible libre, se le ofrece de una vez
    db.refresh(solicitud)
    return solicitud


def _mensaje_oferta(oferta: OfertaEspera) -> str:
    """HU-31, criterio 4: la información básica de la cita."""
    franja = oferta.disponibilidad
    return (
        f"SaludYA: {oferta.solicitud.paciente.nombre}, se liberó un cupo de "
        f"{franja.especialista.especialidad.nombre} con {franja.especialista.nombre} el "
        f"{fecha_legible(franja.fecha)} a las {hora_legible(franja.hora)}, {franja.sede.nombre} "
        f"({franja.modalidad.value}). Se lo guardamos hasta el {_cuando(oferta.expira_en)}. "
        f"Acéptelo o recházelo aquí: {settings.frontend_url}/lista-espera"
    )


def asignar_cupos(db: Session) -> int:
    """HU-31: ofrece horarios compatibles a las solicitudes en espera. Devuelve cuántos ofreció."""
    ahora = datetime.now(timezone.utc)
    desde = ahora_colombia() + _plazo()
    nuevas = []
    for solicitud in repo.en_espera_para_ofrecer(db):
        franja = repo.primera_franja_compatible(db, solicitud, desde)
        if franja is None:
            continue
        franja.estado = EstadoDisponibilidad.RESERVADO  # nadie más lo ve mientras decide
        oferta = OfertaEspera(solicitud=solicitud, disponibilidad=franja, ofrecida_en=ahora, expira_en=ahora + _plazo())
        db.add(oferta)
        solicitud.estado = EstadoSolicitud.CUPO_OFRECIDO
        auditoria_service.registrar(
            db, SISTEMA, "ofrecer_cupo",
            f"Ofreció un cupo de la lista de espera para el {fecha_legible(franja.fecha)} a las "
            f"{hora_legible(franja.hora)}",
            paciente_id=solicitud.paciente_id,
        )
        db.flush()  # la siguiente solicitud ya no ve este horario como libre
        nuevas.append(oferta)
    db.commit()

    for oferta in nuevas:  # HU-31, criterio 3
        enviar_por_canal(oferta.solicitud.paciente, oferta.solicitud.canal, _mensaje_oferta(oferta))
    return len(nuevas)


def _liberar(oferta: OfertaEspera, estado: EstadoOferta, ahora: datetime) -> None:
    """La oferta termina sin cita: el horario vuelve a estar libre y la solicitud, en espera."""
    oferta.estado = estado
    oferta.respondida_en = ahora
    oferta.disponibilidad.estado = EstadoDisponibilidad.DISPONIBLE
    if oferta.solicitud.estado == EstadoSolicitud.CUPO_OFRECIDO:
        oferta.solicitud.estado = EstadoSolicitud.EN_ESPERA


def vencer_ofertas(db: Session) -> int:
    """Tarea de fondo: las ofertas sin respuesta a tiempo vencen (y asignar_cupos pasa el cupo al siguiente)."""
    ahora = datetime.now(timezone.utc)
    vencidas = repo.ofertas_vencidas(db, ahora)
    for oferta in vencidas:
        _liberar(oferta, EstadoOferta.VENCIDA, ahora)
        auditoria_service.registrar(
            db, SISTEMA, "vencer_cupo", "El cupo ofrecido venció sin respuesta; conserva su lugar en la lista",
            paciente_id=oferta.solicitud.paciente_id,
        )
    db.commit()
    return len(vencidas)


def _solicitud_del_paciente(db: Session, paciente: Paciente, solicitud_id: uuid.UUID) -> SolicitudEspera:
    solicitud = repo.obtener_con_lock(db, solicitud_id)
    if solicitud is None or solicitud.paciente_id != paciente.id:
        raise ListaEsperaInvalidaError("No existe esa solicitud de lista de espera.")
    return solicitud


def _oferta_vigente(db: Session, solicitud: SolicitudEspera) -> OfertaEspera:
    oferta = repo.oferta_pendiente_con_lock(db, solicitud.id)
    if oferta is None:
        db.rollback()
        raise ListaEsperaInvalidaError("Esta solicitud no tiene un cupo ofrecido en este momento.")
    return oferta


def aceptar(db: Session, paciente: Paciente, solicitud_id: uuid.UUID) -> SolicitudEspera:
    """HU-32, criterio 2: la cita queda registrada (con su comprobante, como al agendar)."""
    solicitud = _solicitud_del_paciente(db, paciente, solicitud_id)
    oferta = _oferta_vigente(db, solicitud)
    ahora = datetime.now(timezone.utc)
    if oferta.expira_en <= ahora:
        db.rollback()
        raise ListaEsperaInvalidaError("El plazo para aceptar este cupo ya venció. Conserva su lugar en la lista.")

    oferta.estado = EstadoOferta.ACEPTADA
    oferta.respondida_en = ahora
    solicitud.estado = EstadoSolicitud.ASIGNADA
    solicitud.cerrada_en = ahora
    # confirmar_cita exige el horario libre y lo vuelve a reservar, ya con la cita.
    oferta.disponibilidad.estado = EstadoDisponibilidad.DISPONIBLE
    cita = citas_service.confirmar_cita(
        db, paciente.id, oferta.disponibilidad_id, solicitud.canal,
        actor=Actor.de_paciente(paciente, via="lista de espera"),
    )
    solicitud.cita_id = cita.id
    comprobante_service.generar_comprobante(db, cita)  # guarda también solicitud.cita_id
    db.refresh(solicitud)
    return solicitud


def rechazar(db: Session, paciente: Paciente, solicitud_id: uuid.UUID) -> SolicitudEspera:
    """HU-32, criterio 3: conserva su solicitud y su lugar; el cupo pasa al siguiente."""
    solicitud = _solicitud_del_paciente(db, paciente, solicitud_id)
    _liberar(_oferta_vigente(db, solicitud), EstadoOferta.RECHAZADA, datetime.now(timezone.utc))
    auditoria_service.registrar(
        db, Actor.de_paciente(paciente), "rechazar_cupo",
        "Rechazó el cupo ofrecido; conserva su lugar en la lista", paciente_id=paciente.id,
    )
    db.commit()
    asignar_cupos(db)
    db.refresh(solicitud)
    return solicitud


def salir(db: Session, paciente: Paciente, solicitud_id: uuid.UUID) -> SolicitudEspera:
    solicitud = _solicitud_del_paciente(db, paciente, solicitud_id)
    if solicitud.estado not in repo.ACTIVAS:
        db.rollback()
        raise ListaEsperaInvalidaError("Esta solicitud ya no está en la lista de espera.")
    ahora = datetime.now(timezone.utc)
    oferta = repo.oferta_pendiente_con_lock(db, solicitud.id)
    if oferta is not None:
        _liberar(oferta, EstadoOferta.RECHAZADA, ahora)
    solicitud.estado = EstadoSolicitud.CANCELADA
    solicitud.cerrada_en = ahora
    auditoria_service.registrar(
        db, Actor.de_paciente(paciente), "salir_lista_espera",
        f"Salió de la lista de espera de {solicitud.especialidad.nombre}", paciente_id=paciente.id,
    )
    db.commit()
    if oferta is not None:
        asignar_cupos(db)
    db.refresh(solicitud)
    return solicitud


def solicitud_out(db: Session, solicitud: SolicitudEspera, fila: list[uuid.UUID] | None = None) -> dict:
    """Datos para el paciente, con su posición (HU-19) y el cupo ofrecido (HU-31)."""
    if fila is None:
        fila = repo.ids_en_orden(db, solicitud.especialidad_id)
    oferta = solicitud.oferta_vigente
    franja = oferta.disponibilidad if oferta else None
    cita = solicitud.cita
    return {
        "id": solicitud.id,
        "especialidad": solicitud.especialidad.nombre,
        "sedes": sorted(s.nombre for s in solicitud.sedes),
        "jornada": solicitud.jornada,
        "modalidad": solicitud.modalidad,
        "canal": solicitud.canal,
        "estado": solicitud.estado,
        "creado_en": solicitud.creado_en,
        "posicion": fila.index(solicitud.id) + 1 if solicitud.id in fila else None,
        "total_en_lista": len(fila),
        "oferta": {
            "especialista": franja.especialista.nombre,
            "sede": franja.sede.nombre,
            "modalidad": franja.modalidad,
            "fecha": franja.fecha,
            "hora": franja.hora,
            "expira_en": oferta.expira_en,
        } if oferta else None,
        "cita": {
            "id": cita.id,
            "numero_comprobante": cita.numero_comprobante,
            "especialista": cita.disponibilidad.especialista.nombre,
            "sede": cita.disponibilidad.sede.nombre,
            "fecha": cita.disponibilidad.fecha,
            "hora": cita.disponibilidad.hora,
        } if cita else None,
    }


def mis_solicitudes(db: Session, paciente: Paciente) -> list[dict]:
    """HU-19: las solicitudes del paciente con su posición actual (criterios 1, 2 y 4)."""
    filas: dict[uuid.UUID, list[uuid.UUID]] = {}
    salida = []
    for solicitud in repo.del_paciente(db, paciente.id):
        if solicitud.especialidad_id not in filas:
            filas[solicitud.especialidad_id] = repo.ids_en_orden(db, solicitud.especialidad_id)
        salida.append(solicitud_out(db, solicitud, filas[solicitud.especialidad_id]))
    return salida
