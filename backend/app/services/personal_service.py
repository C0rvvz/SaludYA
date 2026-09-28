"""
Cuentas del personal: inicio de sesión y administración de usuarios.

- El error de inicio de sesión no dice si falló el correo o la
  contraseña (no revela qué correos existen).
- Tras 5 intentos fallidos seguidos, el correo queda bloqueado 15
  minutos (frena a quien intente adivinar contraseñas). El contador vive
  en memoria, como el historial del chat: con un solo proceso de la API.
- Nunca se deja el sistema sin un administrador activo.
"""

import secrets
import threading
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import hash_password, verificar_password
from app.models.personal import Personal, RolPersonal
from app.repositories import personal_repository
from app.services.exceptions import (
    CredencialesInvalidasError,
    CuentaBloqueadaError,
    PersonalInvalidoError,
)

MIN_LONGITUD_PASSWORD = 10
_MAX_INTENTOS = 5
_BLOQUEO = timedelta(minutes=15)

# correo -> (intentos fallidos seguidos, bloqueado hasta)
_intentos: dict[str, tuple[int, datetime | None]] = {}
_lock = threading.Lock()

# Hash de una contraseña aleatoria, calculado una sola vez: si el correo
# no existe, se verifica contra este para que la respuesta tarde lo
# mismo que con un correo real (no se revela qué correos existen).
_HASH_FICTICIO = hash_password(secrets.token_urlsafe(16))


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _normalizar_correo(correo: str) -> str:
    return correo.strip().lower()


def _validar_password(password: str) -> None:
    if len(password) < MIN_LONGITUD_PASSWORD:
        raise PersonalInvalidoError(
            f"La contraseña debe tener al menos {MIN_LONGITUD_PASSWORD} caracteres."
        )


def autenticar(db: Session, correo: str, password: str) -> Personal:
    correo = _normalizar_correo(correo)
    with _lock:
        fallidos, bloqueado_hasta = _intentos.get(correo, (0, None))
        if bloqueado_hasta and bloqueado_hasta > _ahora():
            raise CuentaBloqueadaError(
                "Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo."
            )

    personal = personal_repository.obtener_por_correo(db, correo)
    # Se verifica la contraseña aunque el correo no exista o la cuenta
    # esté inactiva, para no revelarlo por el tiempo de respuesta.
    valido = verificar_password(password, personal.password_hash if personal else _HASH_FICTICIO)

    if personal is None or not valido or not personal.activo:
        with _lock:
            fallidos += 1
            _intentos[correo] = (
                fallidos,
                _ahora() + _BLOQUEO if fallidos >= _MAX_INTENTOS else None,
            )
        raise CredencialesInvalidasError("Correo o contraseña incorrectos.")

    with _lock:
        _intentos.pop(correo, None)
    personal.ultimo_acceso_en = _ahora()
    db.commit()
    db.refresh(personal)
    return personal


def crear(db: Session, nombre: str, correo: str, rol: RolPersonal, password: str) -> Personal:
    correo = _normalizar_correo(correo)
    if not nombre.strip():
        raise PersonalInvalidoError("El nombre es obligatorio.")
    _validar_password(password)
    if personal_repository.obtener_por_correo(db, correo) is not None:
        raise PersonalInvalidoError("Ya existe una cuenta con ese correo.")

    personal = Personal(
        nombre=nombre.strip(),
        correo=correo,
        password_hash=hash_password(password),
        rol=rol,
        activo=True,
    )
    db.add(personal)
    db.commit()
    db.refresh(personal)
    return personal


def actualizar(
    db: Session,
    personal_id: uuid.UUID,
    quien_modifica: Personal,
    *,
    nombre: str | None = None,
    rol: RolPersonal | None = None,
    activo: bool | None = None,
    password: str | None = None,
) -> Personal:
    personal = personal_repository.obtener_por_id(db, personal_id)
    if personal is None:
        raise PersonalInvalidoError("No existe esa cuenta.")

    deja_de_ser_admin_activo = personal.rol == RolPersonal.ADMINISTRADOR and personal.activo and (
        activo is False or (rol is not None and rol != RolPersonal.ADMINISTRADOR)
    )
    if deja_de_ser_admin_activo:
        if personal.id == quien_modifica.id:
            raise PersonalInvalidoError(
                "No puede quitarse a sí mismo el rol de administrador ni desactivar su propia cuenta."
            )
        if personal_repository.contar_administradores_activos(db) <= 1:
            raise PersonalInvalidoError("Debe quedar al menos un administrador activo.")

    if nombre is not None:
        if not nombre.strip():
            raise PersonalInvalidoError("El nombre es obligatorio.")
        personal.nombre = nombre.strip()
    if rol is not None:
        personal.rol = rol
    if activo is not None:
        personal.activo = activo
    if password is not None:
        _validar_password(password)
        personal.password_hash = hash_password(password)
    db.commit()
    db.refresh(personal)
    return personal
