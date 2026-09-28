"""
JWT — se emite justo después de validar el OTP correctamente
(HU-03, "permitir el acceso"). A partir de la Parte 7, los endpoints
que requieran un paciente autenticado lo exigen mediante
app.core.dependencies.get_current_paciente.

El personal (apartado de administración) recibe un token distinto:
lleva "tipo": "personal", y los endpoints de cada lado rechazan el
token del otro (ver dependencies.py). Su contraseña se guarda con
scrypt (hash_password / verificar_password).
"""

import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

ALGORITHM = "HS256"

TIPO_PACIENTE = "paciente"
TIPO_PERSONAL = "personal"


def crear_access_token(
    sujeto_id: uuid.UUID, rol: str = "paciente", tipo: str = TIPO_PACIENTE
) -> tuple[str, datetime]:
    ahora = datetime.now(timezone.utc)
    expira = ahora + timedelta(minutes=settings.jwt_expire_minutes)

    payload = {
        "sub": str(sujeto_id),
        "rol": rol,
        "tipo": tipo,
        "iat": ahora,
        "exp": expira,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
    return token, expira


# --- Contraseñas del personal ---
# scrypt (biblioteca estándar de Python): lento a propósito y con sal
# aleatoria por contraseña, para que un robo de la base de datos no
# permita recuperar las contraseñas. Formato guardado:
# scrypt$n$r$p$sal_base64$hash_base64
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def _b64(datos: bytes) -> str:
    return base64.b64encode(datos).decode()


def hash_password(password: str) -> str:
    sal = secrets.token_bytes(16)
    derivado = hashlib.scrypt(
        password.encode(), salt=sal, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(sal)}${_b64(derivado)}"


def verificar_password(password: str, guardado: str) -> bool:
    try:
        algoritmo, n, r, p, sal, esperado = guardado.split("$")
        if algoritmo != "scrypt":
            return False
        esperado_bytes = base64.b64decode(esperado)
        calculado = hashlib.scrypt(
            password.encode(),
            salt=base64.b64decode(sal),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(esperado_bytes),
        )
    except (ValueError, TypeError):
        return False
    # Comparación en tiempo constante: no revela cuántos bytes coinciden.
    return hmac.compare_digest(calculado, esperado_bytes)


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
