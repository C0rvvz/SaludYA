"""
Envío de mensajes al paciente por el canal que eligió (HU-16: canal de
recordatorio). Lo usan el comprobante (HU-17), la cancelación (HU-21) y
los recordatorios (HU-22).

WhatsApp usa la integración real o simulada según WHATSAPP_MODE. SMS,
correo y llamada no tienen integración todavía: se simulan registrando
el mensaje en los logs, igual que el resto del proyecto.
"""

import logging

from app.integrations.whatsapp.client import enviar_mensaje_whatsapp
from app.models.cita import CanalContacto
from app.models.paciente import Paciente

logger = logging.getLogger("saludya.notificaciones")


def enviar_por_canal(paciente: Paciente, canal: CanalContacto, mensaje: str) -> bool:
    """Devuelve True si el mensaje salió (o se simuló) correctamente."""
    if canal == CanalContacto.WHATSAPP:
        return enviar_mensaje_whatsapp(paciente.telefono_whatsapp, mensaje)

    logger.info("[ENVÍO SIMULADO - %s] %s", canal.value, mensaje)
    return True
