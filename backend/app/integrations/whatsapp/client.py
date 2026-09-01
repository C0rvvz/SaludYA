"""
Cliente de envío de mensajes por WhatsApp — HU-02, HU-04.

Soporta dos modos, controlados por la variable de entorno WHATSAPP_MODE:

- "mock" (por defecto): no envía nada real, solo registra el mensaje en
  los logs de la aplicación. Es el modo activo mientras no haya
  credenciales reales de WhatsApp Cloud API configuradas.
- "real": envía el mensaje de verdad usando WhatsApp Cloud API de Meta
  (Graph API), usando WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID.

El resto de la aplicación (servicios, routers) siempre llama a
enviar_mensaje_whatsapp() sin saber en qué modo está funcionando --
pasar de mock a real es cuestión de variables de entorno, no de código.
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("saludya.whatsapp")

GRAPH_API_VERSION = "v20.0"


def enviar_mensaje_whatsapp(telefono: str, mensaje: str) -> bool:
    if settings.whatsapp_mode == "real":
        return _enviar_real(telefono, mensaje)
    return _enviar_mock(telefono, mensaje)


def _enviar_mock(telefono: str, mensaje: str) -> bool:
    logger.info(
        "[WHATSAPP MOCK] Simulando envío a %s******%s -> %s",
        telefono[:3], telefono[-4:], mensaje,
    )
    return True


def _enviar_real(telefono: str, mensaje: str) -> bool:
    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        logger.error(
            "WHATSAPP_MODE=real pero faltan WHATSAPP_ACCESS_TOKEN o "
            "WHATSAPP_PHONE_NUMBER_ID en las variables de entorno."
        )
        return False

    url = (
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/"
        f"{settings.whatsapp_phone_number_id}/messages"
    )
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": telefono,
        "type": "text",
        "text": {"body": mensaje},
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        return True
    except httpx.HTTPError as e:
        logger.error("Error enviando mensaje real por WhatsApp Cloud API: %s", e)
        return False
