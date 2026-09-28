"""
Dependencias de FastAPI para proteger endpoints con JWT.

Paciente (a partir de la Parte 7):

    @router.get("/algo-protegido")
    def endpoint(paciente: Paciente = Depends(get_current_paciente)):
        ...

Personal (apartado de administración), exigiendo un permiso:

    @router.post("/admin/algo")
    def endpoint(personal: Personal = Depends(requiere(Permiso.GESTIONAR_CITAS))):
        ...

Cada lado rechaza el token del otro: un paciente no puede usar su sesión
en el apartado de administración, ni al revés.
"""

import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permisos import Permiso, tiene_permiso
from app.core.security import TIPO_PACIENTE, TIPO_PERSONAL, decodificar_access_token
from app.models.paciente import Paciente
from app.models.personal import Personal
from app.repositories import paciente_repository, personal_repository

security_scheme = HTTPBearer()


def _no_autorizado(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detalle)


def _leer_token(token: str, tipo_esperado: str) -> uuid.UUID:
    try:
        payload = decodificar_access_token(token)
    except jwt.ExpiredSignatureError:
        raise _no_autorizado("La sesión expiró. Inicia sesión de nuevo.")
    except jwt.InvalidTokenError:
        raise _no_autorizado("Token inválido.")

    # Los tokens de paciente emitidos antes de existir el campo "tipo"
    # no lo traen: se asume "paciente".
    if payload.get("tipo", TIPO_PACIENTE) != tipo_esperado:
        raise _no_autorizado("Token inválido.")
    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise _no_autorizado("Token inválido.")


def get_current_paciente(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Paciente:
    paciente_id = _leer_token(credentials.credentials, TIPO_PACIENTE)
    paciente = paciente_repository.obtener_por_id(db, paciente_id)
    if paciente is None:
        raise _no_autorizado("Paciente no encontrado.")
    return paciente


def get_current_personal(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Personal:
    personal_id = _leer_token(credentials.credentials, TIPO_PERSONAL)
    personal = personal_repository.obtener_por_id(db, personal_id)
    # Una cuenta desactivada pierde el acceso de inmediato, aunque su
    # token todavía no haya vencido.
    if personal is None or not personal.activo:
        raise _no_autorizado("Su cuenta no está activa. Comuníquese con un administrador.")
    return personal


def requiere(permiso: Permiso) -> Callable[..., Personal]:
    """Dependencia: personal autenticado CON el permiso indicado (si no, 403)."""

    def dependencia(personal: Personal = Depends(get_current_personal)) -> Personal:
        if not tiene_permiso(personal.rol, permiso):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Su rol no tiene permiso para realizar esta acción.",
            )
        return personal

    return dependencia
