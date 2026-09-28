"""
JWT — se emite justo después de validar el OTP correctamente
(HU-03, "permitir el acceso"). A partir de la Parte 7, los endpoints
que requieran un paciente autenticado lo exigen mediante
app.core.dependencies.get_current_paciente.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def crear_access_token(paciente_id: uuid.UUID, rol: str = "paciente") -> tuple[str, datetime]:
    ahora = datetime.now(timezone.utc)
    expira = ahora + timedelta(minutes=settings.jwt_expire_minutes)

    payload = {
        "sub": str(paciente_id),
        "rol": rol,
        "iat": ahora,
        "exp": expira,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
    return token, expira


def decodificar_access_token(token: str) -> dict:
    """Puede lanzar jwt.ExpiredSignatureError o jwt.InvalidTokenError."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])


# --- HU-23: enlace para confirmar la asistencia desde el recordatorio ---
# Token de un solo propósito: solo sirve para confirmar la asistencia a
# UNA cita, y vence cuando la cita empieza. Lleva "aud", así que
# decodificar_access_token lo rechaza (InvalidAudienceError): no puede
# usarse como sesión.
AUDIENCIA_CONFIRMAR_ASISTENCIA = "confirmar_asistencia"


def crear_token_confirmacion_asistencia(cita_id: uuid.UUID, expira: datetime) -> str:
    payload = {
        "sub": str(cita_id),
        "aud": AUDIENCIA_CONFIRMAR_ASISTENCIA,
        "iat": datetime.now(timezone.utc),
        "exp": expira,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def leer_token_confirmacion_asistencia(token: str) -> uuid.UUID:
    """Puede lanzar jwt.ExpiredSignatureError o jwt.InvalidTokenError."""
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[ALGORITHM],
        audience=AUDIENCIA_CONFIRMAR_ASISTENCIA,
    )
    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise jwt.InvalidTokenError("Token sin cita válida.")
