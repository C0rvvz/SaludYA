"""
Recordatorios de cita — HU-22 (y HU-23, criterio 1).

Una tarea de fondo (ver tareas_periodicas.py) llama periódicamente a
enviar_recordatorios_pendientes(): toma las citas activas que empiezan
dentro de la ventana de anticipación (RECORDATORIO_ANTICIPACION_HORAS)
y todavía no tienen recordatorio, y lo envía por el canal que eligió
el paciente al agendar.

- Criterio 1 (antes de la cita) y 4 (con anticipación suficiente): la
  ventana es configurable; por defecto 24 horas. Una cita agendada con
  menos anticipación recibe el recordatorio en la siguiente pasada.
- Criterio 2: el mensaje incluye fecha y hora.
- Criterio 3: se envía por el canal seleccionado.
- HU-23, criterio 1: el mensaje trae un enlace para confirmar la
  asistencia con un toque, sin iniciar sesión.
- Si el envío falla, se reintenta en las siguientes pasadas hasta
  RECORDATORIO_MAX_INTENTOS.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import CanalContacto, Cita
from app.repositories import cita_repository
from app.services import auditoria_service, citas_service
from app.services.auditoria_service import SISTEMA, Actor
from app.services.exceptions import CitaNoModificableError, EnvioFallidoError
from app.utils.tiempo import ahora_colombia, fecha_legible, hora_legible

logger = logging.getLogger("saludya.recordatorios")

NOMBRE_CANAL = {
    CanalContacto.WHATSAPP: "WhatsApp",
    CanalContacto.SMS: "mensaje de texto",
    CanalContacto.CORREO: "correo electrónico",
    CanalContacto.LLAMADA: "llamada",
}


def enlace_confirmacion(cita: Cita) -> str:
    return f"{settings.frontend_url}/confirmar-asistencia?token={citas_service.token_de_confirmacion(cita)}"


def mensaje_recordatorio(cita: Cita) -> str:
    franja = cita.disponibilidad
    return (
        f"Recordatorio SaludYA: tiene cita de {franja.especialista.especialidad.nombre} "
        f"con {franja.especialista.nombre} el {fecha_legible(franja.fecha)} a las "
        f"{hora_legible(franja.hora)}, {franja.sede.nombre} ({franja.modalidad.value}). "
        f"Comprobante {cita.numero_comprobante}. "
        f"Confirme su asistencia aquí: {enlace_confirmacion(cita)}"
    )


def enviar_recordatorios_pendientes(db: Session) -> int:
    """Envía los recordatorios que correspondan. Devuelve cuántos salieron."""
    ahora = ahora_colombia()
    limite = ahora + timedelta(hours=settings.recordatorio_anticipacion_horas)
    candidatas = cita_repository.pendientes_de_recordatorio(
        db, ahora.date(), limite.date(), settings.recordatorio_max_intentos
    )

    enviados = 0
    for cita in candidatas:
        inicio = datetime.combine(cita.disponibilidad.fecha, cita.disponibilidad.hora)
        if not ahora < inicio <= limite:
            continue

        if _enviar(db, cita, SISTEMA, "Envió el recordatorio automático"):
            enviados += 1
        else:
            logger.warning(
                "No se pudo enviar el recordatorio de la cita %s (intento %s de %s).",
                cita.numero_comprobante,
                cita.recordatorio_intentos,
                settings.recordatorio_max_intentos,
            )

    db.commit()
    return enviados


def _enviar(db: Session, cita: Cita, actor: Actor, descripcion: str) -> bool:
    """Envía el recordatorio por el canal de la cita y deja el resultado en la auditoría."""
    cita.recordatorio_intentos += 1
    canal = NOMBRE_CANAL[cita.canal_recordatorio]
    enviado = enviar_por_canal(cita.paciente, cita.canal_recordatorio, mensaje_recordatorio(cita))
    if enviado:
        cita.recordatorio_enviado_en = datetime.now(timezone.utc)
    auditoria_service.registrar(
        db,
        actor,
        "recordatorio" if enviado else "recordatorio_fallido",
        f"{descripcion} por {canal}" if enviado else f"No se pudo enviar el recordatorio por {canal}",
        cita=cita,
    )
    return enviado


def enviar_recordatorio_manual(db: Session, cita_id, actor: Actor) -> Cita:
    """
    HU-36: el personal envía el recordatorio de una cita cuando lo
    necesita (criterio 3: por el canal del paciente; criterio 4: queda
    registrado). Solo para citas que todavía van a ocurrir.
    """
    cita = cita_repository.obtener_con_lock(db, cita_id)
    if cita is None or not citas_service.esta_activa(cita):
        db.rollback()
        raise CitaNoModificableError(
            "Solo se pueden enviar recordatorios de citas que todavía no ocurren."
        )
    enviado = _enviar(db, cita, actor, "Envió un recordatorio manual")
    db.commit()
    if not enviado:
        raise EnvioFallidoError(
            f"No se pudo enviar el recordatorio por {NOMBRE_CANAL[cita.canal_recordatorio]}. "
            "Intente de nuevo o contacte al paciente por otro medio."
        )
    db.refresh(cita)
    return cita
