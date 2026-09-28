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
from app.models.cita import Cita
from app.repositories import cita_repository
from app.services import citas_service
from app.utils.tiempo import ahora_colombia, fecha_legible, hora_legible

logger = logging.getLogger("saludya.recordatorios")


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

        cita.recordatorio_intentos += 1
        if enviar_por_canal(cita.paciente, cita.canal_recordatorio, mensaje_recordatorio(cita)):
            cita.recordatorio_enviado_en = datetime.now(timezone.utc)
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
