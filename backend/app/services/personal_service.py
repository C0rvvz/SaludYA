"""
Cuentas del personal: inicio de sesión y administración de usuarios.

- El error de inicio de sesión no dice si falló el correo o la
  contraseña (no revela qué correos existen).
- Tras 5 intentos fallidos seguidos, el correo queda bloqueado 15
  minutos (frena a quien intente adivinar contraseñas). El contador vive
  en memoria, como el historial del chat: con un solo proceso de la API.
- Nunca se deja el sistema sin un administrador activo.
- Contraseñas: al menos 12 caracteres, con letras y números, y que no
  sean de las más usadas ni contengan el usuario del correo.
- Desactivar la cuenta, cambiarle el rol o la contraseña cierra sus
  sesiones abiertas (Zero Trust: se vuelve a verificar con los datos nuevos).
- Cada cambio queda en la auditoría: quién lo hizo (nombre, correo y rol),
  a qué cuenta (nombre, correo y rol) y cuándo. Las contraseñas nunca.
"""

import re
import secrets
import threading
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.permisos import NOMBRE_ROL
from app.core.security import TIPO_PERSONAL, hash_password, verificar_password
from app.models.personal import Personal, RolPersonal
from app.models.sesion import MotivoCierre
from app.repositories import personal_repository
from app.services import auditoria_service, sesion_service
from app.services.auditoria_service import SISTEMA, Actor
from app.services.exceptions import (
    CredencialesInvalidasError,
    CuentaBloqueadaError,
    PersonalInvalidoError,
)

MIN_LONGITUD_PASSWORD = 12
_MAX_INTENTOS = 5
_BLOQUEO = timedelta(minutes=15)

# Las que primero prueba quien intenta adivinar (sin distinguir mayúsculas).
_PASSWORDS_COMUNES = {
    "123456789012", "contraseña123", "contrasena123", "password1234", "password12345",
    "qwerty123456", "administrador1", "administrador123", "saludya12345", "saludya2026",
    "colombia12345", "medellin12345", "bogota123456", "abc123456789", "clave1234567",
}

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


def _validar_password(password: str, correo: str) -> None:
    if len(password) < MIN_LONGITUD_PASSWORD:
        raise PersonalInvalidoError(
            f"La contraseña debe tener al menos {MIN_LONGITUD_PASSWORD} caracteres."
        )
    if not (re.search(r"[^\W\d_]", password) and re.search(r"\d", password)):
        raise PersonalInvalidoError("La contraseña debe tener letras y números.")
    usuario = correo.split("@")[0].lower()
    if password.lower() in _PASSWORDS_COMUNES or (len(usuario) >= 4 and usuario in password.lower()):
        raise PersonalInvalidoError("Esa contraseña es muy fácil de adivinar. Elija otra.")


def acaba_de_bloquearse(correo: str) -> bool:
    """Si el último intento fallido fue el que bloqueó la cuenta (para registrarlo una sola vez)."""
    with _lock:
        fallidos, bloqueado_hasta = _intentos.get(_normalizar_correo(correo), (0, None))
    return fallidos == _MAX_INTENTOS and bloqueado_hasta is not None


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


def crear(
    db: Session, nombre: str, correo: str, rol: RolPersonal, password: str, quien_crea: Personal | None = None
) -> Personal:
    """`quien_crea`: el administrador que la crea; None si se crea desde la consola (scripts/crear_personal.py)."""
    correo = _normalizar_correo(correo)
    if not nombre.strip():
        raise PersonalInvalidoError("El nombre es obligatorio.")
    _validar_password(password, correo)
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
    db.flush()  # para guardar el id de la cuenta en la auditoría
    auditoria_service.registrar(
        db, Actor.de_personal(quien_crea) if quien_crea else SISTEMA, "crear_cuenta",
        f"Creó la cuenta de {personal.nombre} con el rol {NOMBRE_ROL[rol]}"
        + ("" if quien_crea else " (desde la consola del servidor)"),
        cuenta=personal,
    )
    db.commit()
    db.refresh(personal)
    return personal


def _auditar_cambios(
    db: Session,
    cuenta: Personal,
    actor: Actor,
    nombre: str | None,
    rol: RolPersonal | None,
    activo: bool | None,
    cambia_password: bool,
) -> None:
    """Un registro por cada cambio, con la cuenta como estaba ANTES (su nombre, correo y rol de ese momento)."""

    def registrar(accion: str, descripcion: str, antes: str | None = None, despues: str | None = None) -> None:
        auditoria_service.registrar(
            db, actor, accion, descripcion, cuenta=cuenta, estado_anterior=antes, estado_nuevo=despues
        )

    if nombre is not None and nombre.strip() != cuenta.nombre:
        registrar(
            "cambiar_nombre_cuenta", f"Cambió el nombre de la cuenta de {cuenta.nombre}",
            cuenta.nombre[:60], nombre.strip()[:60],
        )
    if rol is not None and rol != cuenta.rol:
        registrar("cambiar_rol", f"Cambió el rol de la cuenta de {cuenta.nombre}", NOMBRE_ROL[cuenta.rol], NOMBRE_ROL[rol])
    if activo is not None and activo != cuenta.activo:
        if activo:
            registrar("activar_cuenta", f"Activó la cuenta de {cuenta.nombre}", "Inactiva", "Activa")
        else:
            registrar("desactivar_cuenta", f"Desactivó la cuenta de {cuenta.nombre}", "Activa", "Inactiva")
    if cambia_password:
        propia = cuenta.id == actor.id
        registrar("cambiar_clave", "Cambió su propia contraseña" if propia else f"Cambió la contraseña de {cuenta.nombre}")


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

    if nombre is not None and not nombre.strip():
        raise PersonalInvalidoError("El nombre es obligatorio.")
    if password is not None:
        _validar_password(password, personal.correo)

    cambia_el_acceso = (
        (rol is not None and rol != personal.rol)
        or (activo is False and personal.activo)
        or password is not None
    )
    _auditar_cambios(db, personal, Actor.de_personal(quien_modifica), nombre, rol, activo, password is not None)
    if nombre is not None:
        personal.nombre = nombre.strip()
    if rol is not None:
        personal.rol = rol
    if activo is not None:
        personal.activo = activo
    if password is not None:
        personal.password_hash = hash_password(password)
    # Sus sesiones abiertas se cierran: vuelve a ingresar con el rol o la
    # contraseña nuevos (o ya no puede, si se desactivó). Quien cambia su
    # propia contraseña conserva la sesión desde la que lo hizo.
    if cambia_el_acceso and personal.id != quien_modifica.id:
        sesion_service.cerrar_todas(db, TIPO_PERSONAL, personal.id, MotivoCierre.CUENTA_MODIFICADA)
    db.commit()
    db.refresh(personal)
    return personal
