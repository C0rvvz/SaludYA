"""
"No soy un robot" — verificación con Cloudflare Turnstile.

La página resuelve el reto con Cloudflare y recibe un token de un solo
uso; antes de enviar el código, registrar una cuenta o dejar entrar al
personal, el backend le pregunta a Cloudflare si ese token es válido.
Un bot que llame a la API directamente no tiene token y es rechazado.

Sin TURNSTILE_SECRET la verificación está apagada (solo en desarrollo:
config.py no deja arrancar sin ella en otro entorno).
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

URL_VERIFICAR = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def activa() -> bool:
    return bool(settings.turnstile_secret)


def es_humano(token: str | None, ip: str | None) -> bool:
    if not activa():
        return True
    if not token:
        return False
    try:
        respuesta = httpx.post(
            URL_VERIFICAR,
            data={"secret": settings.turnstile_secret, "response": token, "remoteip": ip or ""},
            timeout=5,
        )
        return bool(respuesta.json().get("success"))
    except (httpx.HTTPError, ValueError) as e:
        # Si no se puede comprobar, no se deja pasar (se falla cerrado).
        logger.warning("No se pudo verificar el token de Turnstile: %s", e)
        return False
