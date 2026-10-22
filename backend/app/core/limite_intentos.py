"""
Límite de intentos por conexión (IP) en los endpoints de ingreso.

Frena a quien intente adivinar a fuerza bruta (probando muchas veces
seguidas) documentos registrados, códigos de verificación o contraseñas,
aunque vaya cambiando de cuenta. El bloqueo por cuenta del personal
(personal_service) frena a quien insiste con UNA cuenta; este, a quien
prueba muchas desde la misma conexión.

Vive en memoria, como el historial del chat: con un solo proceso de la API.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.services.exceptions import DemasiadosIntentosError


def ip_de(request: Request) -> str:
    # No se confía en X-Forwarded-For: cualquiera puede escribir esa cabecera.
    return request.client.host if request.client else "desconocida"


class LimiteIntentos:
    """Como máximo `maximo` peticiones por IP en los últimos `ventana_segundos`."""

    def __init__(self, maximo: int, ventana_segundos: int):
        self.maximo = maximo
        self.ventana = ventana_segundos
        self._intentos: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def registrar(self, ip: str) -> None:
        ahora = time.monotonic()
        with self._lock:
            intentos = self._intentos[ip]
            while intentos and ahora - intentos[0] > self.ventana:
                intentos.popleft()
            if len(intentos) >= self.maximo:
                raise DemasiadosIntentosError(
                    "Demasiados intentos desde esta conexión. Espere unos minutos e intente de nuevo."
                )
            intentos.append(ahora)

    def reiniciar(self) -> None:
        with self._lock:
            self._intentos.clear()


# Un ingreso normal del paciente son unas 4 a 6 peticiones (documento, código,
# quizá un reenvío). Identificar el documento tiene su propio límite, más
# estricto: es lo que serviría para averiguar qué documentos están registrados.
IDENTIFICAR_PACIENTE = LimiteIntentos(maximo=10, ventana_segundos=10 * 60)
INGRESO_PACIENTE = LimiteIntentos(maximo=30, ventana_segundos=10 * 60)
INGRESO_PERSONAL = LimiteIntentos(maximo=10, ventana_segundos=15 * 60)

TODOS = (IDENTIFICAR_PACIENTE, INGRESO_PACIENTE, INGRESO_PERSONAL)


def limitar(*limites: LimiteIntentos):
    """Dependencia de FastAPI: rechaza con 429 si la IP superó alguno de los límites."""

    def dependencia(request: Request) -> None:
        ip = ip_de(request)
        try:
            for limite in limites:
                limite.registrar(ip)
        except DemasiadosIntentosError as e:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))

    return dependencia
