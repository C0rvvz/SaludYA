"""
La IP de quien visita la página, para el límite de intentos de ingreso y
el registro de seguridad.

Detrás de un proxy (Render), la conexión siempre viene del proxy: con la
IP de la conexión, todas las visitas compartirían un solo límite y un
visitante podría bloquear el ingreso de todos. Por eso, si se configuró
CABECERA_IP_CLIENTE, la IP se toma de esa cabecera, que pone el proxy.
Nunca de X-Forwarded-For: cualquiera puede escribir esa cabecera.
"""

from fastapi import Request

from app.core.config import settings


def ip_del_cliente(request: Request) -> str | None:
    if settings.cabecera_ip_cliente:
        ip = request.headers.get(settings.cabecera_ip_cliente, "").strip()
        if ip:
            return ip
    return request.client.host if request.client else None
