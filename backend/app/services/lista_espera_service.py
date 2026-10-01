"""
Lista de espera — HU-19, HU-31 y HU-32 (paciente) y HU-45, HU-53 a HU-61
(personal: al final del módulo).

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
from datetime import date, datetime, time, timedelta, timezone

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
    PrioridadMedica,
    SolicitudEspera,
)
from app.models.paciente import Paciente
from app.models.personal import Personal
from app.repositories import (
    disponibilidad_repository,
    especialidad_repository,
    lista_espera_repository as repo,
    sede_repository,
)
from app.services import auditoria_service, citas_service, comprobante_service
from app.services.auditoria_service import SISTEMA, Actor
from app.services.exceptions import (
    DisponibilidadNoEncontradaError,
    HorarioYaNoDisponibleError,
    ListaEsperaInvalidaError,
)
from app.utils.tiempo import ZONA_COLOMBIA, ahora_colombia, fecha_legible, hora_legible

logger = logging.getLogger("saludya.lista_espera")


NO_EXISTE = "No existe esa solicitud de lista de espera."


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
        raise ListaEsperaInvalidaError(NO_EXISTE)
    return solicitud


def _oferta_vigente(db: Session, solicitud: SolicitudEspera) -> OfertaEspera:
    oferta = repo.oferta_pendiente_con_lock(db, solicitud.id)
    if oferta is None:
        db.rollback()
        raise ListaEsperaInvalidaError("Esta solicitud no tiene un cupo ofrecido en este momento.")
    return oferta


def _asignar(db: Session, solicitud: SolicitudEspera, disponibilidad_id: uuid.UUID, actor: Actor) -> SolicitudEspera:
    """
    Registra la cita de la solicitud en ese horario, con su comprobante,
    como al agendar (HU-32 criterio 2 / HU-59). Si tenía ofrecido otro
    horario, ese se libera y pasa al siguiente de la lista.
    """
    ahora = datetime.now(timezone.utc)
    oferta = repo.oferta_pendiente_con_lock(db, solicitud.id)
    liberada = False
    if oferta is not None and oferta.disponibilidad_id == disponibilidad_id:
        oferta.estado = EstadoOferta.ACEPTADA
        oferta.respondida_en = ahora
        # confirmar_cita exige el horario libre y lo vuelve a reservar, ya con la cita.
        oferta.disponibilidad.estado = EstadoDisponibilidad.DISPONIBLE
    elif oferta is not None:
        _liberar(oferta, EstadoOferta.RECHAZADA, ahora)
        liberada = True
    solicitud.estado = EstadoSolicitud.ASIGNADA
    solicitud.cerrada_en = ahora
    try:
        cita = citas_service.confirmar_cita(db, solicitud.paciente_id, disponibilidad_id, solicitud.canal, actor=actor)
    except (DisponibilidadNoEncontradaError, HorarioYaNoDisponibleError):
        db.rollback()
        raise
    solicitud.cita_id = cita.id
    comprobante_service.generar_comprobante(db, cita)  # guarda también solicitud.cita_id
    if liberada:
        asignar_cupos(db)
    db.refresh(solicitud)
    return solicitud


def aceptar(db: Session, paciente: Paciente, solicitud_id: uuid.UUID) -> SolicitudEspera:
    """HU-32, criterio 2: la cita queda registrada."""
    solicitud = _solicitud_del_paciente(db, paciente, solicitud_id)
    oferta = _oferta_vigente(db, solicitud)
    if oferta.expira_en <= datetime.now(timezone.utc):
        db.rollback()
        raise ListaEsperaInvalidaError("El plazo para aceptar este cupo ya venció. Conserva su lugar en la lista.")
    return _asignar(db, solicitud, oferta.disponibilidad_id, Actor.de_paciente(paciente, via="lista de espera"))


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


def _sacar_de_la_lista(
    db: Session, solicitud: SolicitudEspera, actor: Actor, descripcion: str, detalle: str | None = None
) -> SolicitudEspera:
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
        db, actor, "salir_lista_espera", descripcion, paciente_id=solicitud.paciente_id, detalle=detalle
    )
    db.commit()
    if oferta is not None:
        asignar_cupos(db)
    db.refresh(solicitud)
    return solicitud


def salir(db: Session, paciente: Paciente, solicitud_id: uuid.UUID) -> SolicitudEspera:
    solicitud = _solicitud_del_paciente(db, paciente, solicitud_id)
    return _sacar_de_la_lista(
        db, solicitud, Actor.de_paciente(paciente), f"Salió de la lista de espera de {solicitud.especialidad.nombre}"
    )


def solicitud_out(db: Session, solicitud: SolicitudEspera, fila: list[uuid.UUID] | None = None) -> dict:
    """Datos de la solicitud, con su posición (HU-19) y el cupo ofrecido (HU-31)."""
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
            "estado": citas_service.texto_estado(cita),
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


# --- Personal: Fase D (HU-45, HU-53 a HU-61) ---

NOMBRE_PRIORIDAD = {
    PrioridadMedica.NORMAL: "Normal",
    PrioridadMedica.ALTA: "Alta",
    PrioridadMedica.URGENTE: "Urgente",
}


def para_personal(db: Session, dia: date) -> dict:
    """
    HU-45 / HU-53 / HU-61: las solicitudes que estuvieron en la lista ese
    día (HU-45 criterio 3), en el orden de la lista, con el tiempo de
    espera (HU-54: hasta hoy si sigue pendiente, o hasta que se cerró).
    """
    inicio = datetime.combine(dia, time.min, tzinfo=ZONA_COLOMBIA)
    filas: dict[uuid.UUID, list[uuid.UUID]] = {}
    salida = []
    for s in repo.para_personal(db, inicio, inicio + timedelta(days=1)):
        if s.especialidad_id not in filas:
            filas[s.especialidad_id] = repo.ids_en_orden(db, s.especialidad_id)
        salida.append(solicitud_admin_out(db, s, filas[s.especialidad_id]))
    return {"dia": dia, "esperando_ahora": repo.cuenta_activas(db), "solicitudes": salida}


def solicitud_admin_out(db: Session, s: SolicitudEspera, fila: list[uuid.UUID] | None = None) -> dict:
    return {
        **solicitud_out(db, s, fila),
        "especialidad_id": s.especialidad_id,
        "paciente_id": s.paciente_id,
        "paciente_nombre": s.paciente.nombre,
        "numero_documento": s.paciente.numero_documento,
        "telefono_whatsapp": s.paciente.telefono_whatsapp,
        "prioridad": s.prioridad,
        "cerrada_en": s.cerrada_en,
        "minutos_espera": int(((s.cerrada_en or datetime.now(timezone.utc)) - s.creado_en).total_seconds() // 60),
    }


def _solicitud_con_lock(db: Session, solicitud_id: uuid.UUID) -> SolicitudEspera:
    solicitud = repo.obtener_con_lock(db, solicitud_id)
    if solicitud is None:
        raise ListaEsperaInvalidaError(NO_EXISTE)
    return solicitud


def horarios_para(db: Session, solicitud_id: uuid.UUID) -> list[dict]:
    """HU-55 criterio 1 / HU-59: el cupo ya ofrecido (si lo hay) y los horarios libres que se ajustan a la solicitud."""
    solicitud = repo.obtener(db, solicitud_id)
    if solicitud is None:
        raise ListaEsperaInvalidaError(NO_EXISTE)
    if solicitud.estado not in repo.ACTIVAS:
        return []
    oferta = solicitud.oferta_vigente
    franjas = ([oferta.disponibilidad] if oferta else []) + repo.franjas_compatibles(db, solicitud, ahora_colombia())
    return [
        {
            "id": f.id,
            "fecha": f.fecha,
            "hora": f.hora,
            "especialista": f.especialista.nombre,
            "sede": f.sede.nombre,
            "modalidad": f.modalidad,
            "ofrecido": oferta is not None and f.id == oferta.disponibilidad_id,
        }
        for f in franjas
    ]


def confirmar_por_personal(
    db: Session, personal: Personal, solicitud_id: uuid.UUID, disponibilidad_id: uuid.UUID
) -> SolicitudEspera:
    """HU-59: el personal le confirma al paciente una cita en ese horario (p. ej. tras llamarlo)."""
    solicitud = _solicitud_con_lock(db, solicitud_id)
    if solicitud.estado not in repo.ACTIVAS:
        db.rollback()
        raise ListaEsperaInvalidaError("Esta solicitud ya no está en la lista de espera.")
    franja = disponibilidad_repository.obtener_por_id(db, disponibilidad_id)
    if franja is None or franja.especialista.especialidad_id != solicitud.especialidad_id:
        db.rollback()
        raise ListaEsperaInvalidaError(f"Ese horario no es de {solicitud.especialidad.nombre}.")
    return _asignar(db, solicitud, disponibilidad_id, Actor.de_personal(personal))


def cancelar_por_personal(
    db: Session, personal: Personal, solicitud_id: uuid.UUID, motivo: str | None
) -> SolicitudEspera:
    """
    HU-60: si el paciente sigue esperando, sale de la lista; si ya se le
    asignó la cita, se cancela esa cita (y su horario se ofrece a la lista).
    """
    solicitud = _solicitud_con_lock(db, solicitud_id)
    actor = Actor.de_personal(personal)
    if solicitud.estado in repo.ACTIVAS:
        return _sacar_de_la_lista(
            db, solicitud, actor, f"Sacó al paciente de la lista de espera de {solicitud.especialidad.nombre}",
            detalle=motivo,
        )
    if solicitud.estado == EstadoSolicitud.ASIGNADA and solicitud.cita and citas_service.esta_activa(solicitud.cita):
        citas_service.cancelar_cita(db, None, solicitud.cita_id, motivo, actor=actor)
        db.refresh(solicitud)
        return solicitud
    db.rollback()
    raise ListaEsperaInvalidaError("No hay nada que cancelar: la solicitud ya se cerró y su cita ya no está vigente.")


def cambiar_prioridad(
    db: Session, personal: Personal, solicitud_id: uuid.UUID, prioridad: PrioridadMedica
) -> SolicitudEspera:
    """HU-56: la prioridad médica la define el personal; cambia la posición en la lista."""
    solicitud = _solicitud_con_lock(db, solicitud_id)
    if solicitud.estado not in repo.ACTIVAS:
        db.rollback()
        raise ListaEsperaInvalidaError("Solo se puede cambiar la prioridad de quien sigue en la lista.")
    if solicitud.prioridad != prioridad:
        antes = NOMBRE_PRIORIDAD[solicitud.prioridad]
        solicitud.prioridad = prioridad
        auditoria_service.registrar(
            db, Actor.de_personal(personal), "prioridad_lista_espera",
            f"Cambió la prioridad médica en la lista de espera de {solicitud.especialidad.nombre}",
            paciente_id=solicitud.paciente_id, estado_anterior=antes, estado_nuevo=NOMBRE_PRIORIDAD[prioridad],
        )
    db.commit()
    db.refresh(solicitud)
    return solicitud
