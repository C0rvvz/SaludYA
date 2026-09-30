"""
Solicitudes de cita (cartas de petición) y su revisión clínica —
HU-76 a HU-79; indicadores de HU-46 (solicitudes) y HU-47 (revisiones).

- radicar(): el paciente radica una solicitud formal o un derecho de
  petición desde su portal y recibe un número de radicado.
- aprobar() / enviar_a_eps() / negar(): las decisiones de la revisión
  clínica. Aprobar asigna la cita de una vez (con su comprobante, como al
  agendar); una solicitud enviada a la EPS queda pendiente de su
  respuesta, que se registra aprobando (con la cita) o negando.
- indicadores(): HU-46 y HU-47, para el periodo del Dashboard.

SUPUESTO: el tiempo de revisión va desde la radicación hasta la primera
decisión (aprobar, negar o enviar a la EPS).
SUPUESTO: una revisión "prioritaria" es una aprobación que quien revisa
marca como prioritaria.
SUPUESTO: al paciente se le avisa cada decisión por el canal que eligió
al radicar, y ese canal es el de los recordatorios de la cita aprobada.
"""

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import CanalContacto
from app.models.paciente import Paciente
from app.models.personal import Personal
from app.models.solicitud_cita import EstadoSolicitudCita, SolicitudCita, TipoCita, TipoSolicitud
from app.repositories import (
    disponibilidad_repository,
    especialidad_repository,
    solicitud_cita_repository as repo,
)
from app.services import auditoria_service, citas_service, comprobante_service
from app.services.auditoria_service import Actor
from app.services.exceptions import (
    DisponibilidadNoEncontradaError,
    HorarioYaNoDisponibleError,
    SolicitudInvalidaError,
)
from app.utils.tiempo import ZONA_COLOMBIA, fecha_legible, hora_legible, hoy_en_colombia

NOMBRE_TIPO = {TipoSolicitud.FORMAL: "solicitud formal", TipoSolicitud.DERECHO_PETICION: "derecho de petición"}
POR_DECIDIR = (EstadoSolicitudCita.PENDIENTE, EstadoSolicitudCita.PENDIENTE_EPS)


def radicar(
    db: Session,
    paciente: Paciente,
    tipo: TipoSolicitud,
    especialidad_id: uuid.UUID,
    tipo_cita: TipoCita,
    fecha_deseada: date,
    motivo: str,
    canal: CanalContacto,
) -> SolicitudCita:
    especialidad = especialidad_repository.obtener_por_id(db, especialidad_id)
    if especialidad is None:
        raise SolicitudInvalidaError("No existe esa especialidad.")
    if fecha_deseada <= hoy_en_colombia():
        raise SolicitudInvalidaError("La fecha que solicita debe ser a partir de mañana.")

    solicitud = SolicitudCita(
        numero_radicado=f"RAD-{secrets.token_hex(4).upper()}",
        paciente_id=paciente.id,
        tipo=tipo,
        especialidad_id=especialidad_id,
        tipo_cita=tipo_cita,
        fecha_deseada=fecha_deseada,
        motivo=motivo,
        canal=canal,
    )
    db.add(solicitud)
    auditoria_service.registrar(
        db, Actor.de_paciente(paciente), "radicar_solicitud",
        f"Radicó una {NOMBRE_TIPO[tipo]} para una cita de {especialidad.nombre}",
        paciente_id=paciente.id, detalle=motivo,
    )
    try:
        db.commit()
    except IntegrityError:  # número de radicado repetido: prácticamente imposible
        db.rollback()
        raise SolicitudInvalidaError("No se pudo radicar la solicitud. Intente de nuevo.")
    db.refresh(solicitud)
    enviar_por_canal(
        paciente, canal,
        f"SaludYA: radicamos su {NOMBRE_TIPO[tipo]} con el número {solicitud.numero_radicado}. "
        "Le avisaremos cuando sea revisada.",
    )
    return solicitud


def _para_decidir(db: Session, solicitud_id: uuid.UUID) -> SolicitudCita:
    solicitud = repo.obtener_con_lock(db, solicitud_id)
    if solicitud is None:
        raise SolicitudInvalidaError("No existe esa solicitud.")
    if solicitud.estado not in POR_DECIDIR:
        db.rollback()
        raise SolicitudInvalidaError("Esta solicitud ya fue decidida.")
    return solicitud


def _registrar_decision(solicitud: SolicitudCita, personal: Personal, ahora: datetime) -> None:
    if solicitud.revisada_en is None:
        solicitud.revisada_en = ahora
    if solicitud.estado == EstadoSolicitudCita.PENDIENTE_EPS:
        solicitud.respuesta_eps_en = ahora
    solicitud.revisor_id = personal.id


def aprobar(
    db: Session,
    personal: Personal,
    solicitud_id: uuid.UUID,
    disponibilidad_id: uuid.UUID,
    prioritaria: bool,
    respuesta: str | None,
) -> SolicitudCita:
    """Aprueba la solicitud y le asigna la cita en ese horario (HU-47: cita asignada después de la revisión)."""
    solicitud = _para_decidir(db, solicitud_id)
    franja = disponibilidad_repository.obtener_por_id(db, disponibilidad_id)
    if franja is None or franja.especialista.especialidad_id != solicitud.especialidad_id:
        db.rollback()
        raise SolicitudInvalidaError(f"Ese horario no es de {solicitud.especialidad.nombre}.")

    actor = Actor.de_personal(personal)
    _registrar_decision(solicitud, personal, datetime.now(timezone.utc))
    solicitud.estado = EstadoSolicitudCita.APROBADA
    solicitud.prioritaria = prioritaria
    solicitud.respuesta = respuesta
    auditoria_service.registrar(
        db, actor, "aprobar_solicitud",
        f"Aprobó la solicitud {solicitud.numero_radicado}{' como prioritaria' if prioritaria else ''}",
        paciente_id=solicitud.paciente_id, detalle=respuesta,
    )
    try:
        cita = citas_service.confirmar_cita(db, solicitud.paciente_id, disponibilidad_id, solicitud.canal, actor=actor)
    except (DisponibilidadNoEncontradaError, HorarioYaNoDisponibleError):
        db.rollback()
        raise
    solicitud.cita_id = cita.id
    comprobante_service.generar_comprobante(db, cita)  # guarda también solicitud.cita_id
    enviar_por_canal(
        solicitud.paciente, solicitud.canal,
        f"SaludYA: su solicitud {solicitud.numero_radicado} fue aprobada. Su cita de "
        f"{solicitud.especialidad.nombre} es el {fecha_legible(franja.fecha)} a las {hora_legible(franja.hora)}, "
        f"{franja.sede.nombre}." + (f" {respuesta}" if respuesta else ""),
    )
    db.refresh(solicitud)
    return solicitud


def enviar_a_eps(db: Session, personal: Personal, solicitud_id: uuid.UUID, respuesta: str | None) -> SolicitudCita:
    """La solicitud requiere autorización de la EPS: queda pendiente de su respuesta (HU-47, criterio 3)."""
    solicitud = _para_decidir(db, solicitud_id)
    if solicitud.estado != EstadoSolicitudCita.PENDIENTE:
        db.rollback()
        raise SolicitudInvalidaError("Esta solicitud ya está esperando la respuesta de la EPS.")
    ahora = datetime.now(timezone.utc)
    _registrar_decision(solicitud, personal, ahora)
    solicitud.estado = EstadoSolicitudCita.PENDIENTE_EPS
    solicitud.enviada_eps_en = ahora
    solicitud.respuesta = respuesta
    auditoria_service.registrar(
        db, Actor.de_personal(personal), "enviar_eps_solicitud",
        f"Envió la solicitud {solicitud.numero_radicado} a la EPS", paciente_id=solicitud.paciente_id, detalle=respuesta,
    )
    db.commit()
    db.refresh(solicitud)
    enviar_por_canal(
        solicitud.paciente, solicitud.canal,
        f"SaludYA: su solicitud {solicitud.numero_radicado} fue enviada a su EPS para autorización. "
        "Le avisaremos su respuesta.",
    )
    return solicitud


def negar(db: Session, personal: Personal, solicitud_id: uuid.UUID, respuesta: str) -> SolicitudCita:
    solicitud = _para_decidir(db, solicitud_id)
    _registrar_decision(solicitud, personal, datetime.now(timezone.utc))
    solicitud.estado = EstadoSolicitudCita.NEGADA
    solicitud.respuesta = respuesta
    auditoria_service.registrar(
        db, Actor.de_personal(personal), "negar_solicitud",
        f"No aprobó la solicitud {solicitud.numero_radicado}", paciente_id=solicitud.paciente_id, detalle=respuesta,
    )
    db.commit()
    db.refresh(solicitud)
    enviar_por_canal(
        solicitud.paciente, solicitud.canal,
        f"SaludYA: su solicitud {solicitud.numero_radicado} no fue aprobada. Motivo: {respuesta}",
    )
    return solicitud


def solicitud_out(solicitud: SolicitudCita) -> dict:
    cita = solicitud.cita
    return {
        "id": solicitud.id,
        "numero_radicado": solicitud.numero_radicado,
        "tipo": solicitud.tipo,
        "especialidad_id": solicitud.especialidad_id,
        "especialidad": solicitud.especialidad.nombre,
        "tipo_cita": solicitud.tipo_cita,
        "fecha_deseada": solicitud.fecha_deseada,
        "motivo": solicitud.motivo,
        "canal": solicitud.canal,
        "estado": solicitud.estado,
        "radicada_en": solicitud.radicada_en,
        "revisada_en": solicitud.revisada_en,
        "revisor": solicitud.revisor.nombre if solicitud.revisor else None,
        "prioritaria": solicitud.prioritaria,
        "respuesta": solicitud.respuesta,
        "enviada_eps_en": solicitud.enviada_eps_en,
        "respuesta_eps_en": solicitud.respuesta_eps_en,
        "paciente_id": solicitud.paciente_id,
        "paciente_nombre": solicitud.paciente.nombre,
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


def indicadores(db: Session, desde: date, hasta: date) -> dict:
    """HU-46 (solicitudes) y HU-47 (revisiones) de las radicadas en el periodo."""
    inicio = datetime.combine(desde, datetime.min.time(), tzinfo=ZONA_COLOMBIA)
    fin = datetime.combine(hasta + timedelta(days=1), datetime.min.time(), tzinfo=ZONA_COLOMBIA)
    solicitudes = repo.radicadas_entre(db, inicio, fin)
    aprobadas = [s for s in solicitudes if s.estado == EstadoSolicitudCita.APROBADA]
    revisadas = [s.revisada_en - s.radicada_en for s in solicitudes if s.revisada_en]
    return {
        "recibidas": len(solicitudes),
        "pendientes_revision": sum(1 for s in solicitudes if s.estado == EstadoSolicitudCita.PENDIENTE),
        "prioritarias_aprobadas": sum(1 for s in aprobadas if s.prioritaria),
        "formales": sum(1 for s in solicitudes if s.tipo == TipoSolicitud.FORMAL),
        "derechos_peticion": sum(1 for s in solicitudes if s.tipo == TipoSolicitud.DERECHO_PETICION),
        "minutos_promedio_revision": (
            round(sum(revisadas, timedelta()) / len(revisadas) / timedelta(minutes=1)) if revisadas else None
        ),
        "citas_asignadas": sum(1 for s in aprobadas if s.cita_id),
        "pendientes_eps": sum(1 for s in solicitudes if s.estado == EstadoSolicitudCita.PENDIENTE_EPS),
    }
