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

Además del token, la SESIÓN del servidor que lleva el token ("sid") debe
seguir abierta y con actividad reciente (RNF-17 y RNF-24, ver
services/sesion_service.py): así una sesión se puede cerrar de verdad
aunque su token no haya vencido.
"""

import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permisos import Permiso, tiene_permiso
from app.core.security import TIPO_PACIENTE, TIPO_PERSONAL, decodificar_access_token
from app.models.paciente import Paciente
from app.models.personal import Personal
from app.models.sesion import Sesion
from app.repositories import paciente_repository, personal_repository
from app.services import seguridad_service, sesion_service
from app.services.exceptions import SesionCerradaError

security_scheme = HTTPBearer()


def _no_autorizado(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detalle)


TOKEN_INVALIDO = "Token inválido."


def _token_invalido(db: Session, request: Request, tipo_esperado: str, motivo: str) -> HTTPException:
    """Un token alterado, falso o de otro tipo de cuenta: queda en los eventos de seguridad."""
    seguridad_service.registrar(
        db, "token_invalido", seguridad_service.ALTA, tipo_esperado,
        f"Petición rechazada: {motivo}", request=request, detalle=f"{request.method} {request.url.path}",
        agrupar=True,
    )
    return _no_autorizado(TOKEN_INVALIDO)


def _autenticar(token: str, tipo_esperado: str, db: Session, request: Request) -> tuple[uuid.UUID, Sesion]:
    """El id de quien hace la petición y su sesión, ya validada y con la actividad al día."""
    try:
        payload = decodificar_access_token(token)
    except jwt.ExpiredSignatureError:
        raise _no_autorizado("Su sesión expiró. Inicie sesión de nuevo.")  # normal: no es un evento de seguridad
    except jwt.InvalidTokenError:
        raise _token_invalido(db, request, tipo_esperado, "token con firma inválida o mal formado")

    if payload.get("tipo") != tipo_esperado:
        raise _token_invalido(db, request, tipo_esperado, f"token de {payload.get('tipo')} usado como {tipo_esperado}")
    try:
        sujeto_id = uuid.UUID(payload["sub"])
        sid = uuid.UUID(payload["sid"])
    except (KeyError, ValueError, TypeError):
        raise _token_invalido(db, request, tipo_esperado, "token sin los datos de su sesión")

    try:
        sesion = sesion_service.validar(db, sid, tipo_esperado, sujeto_id)
    except SesionCerradaError as e:
        raise _no_autorizado(str(e))
    return sujeto_id, sesion


def sesion_del_paciente(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Sesion:
    return _autenticar(credentials.credentials, TIPO_PACIENTE, db, request)[1]


def sesion_del_personal(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Sesion:
    return _autenticar(credentials.credentials, TIPO_PERSONAL, db, request)[1]


def get_current_paciente(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Paciente:
    paciente_id, _ = _autenticar(credentials.credentials, TIPO_PACIENTE, db, request)
    paciente = paciente_repository.obtener_por_id(db, paciente_id)
    if paciente is None:
        raise _no_autorizado("Paciente no encontrado.")
    return paciente


def get_current_personal(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Personal:
    personal_id, _ = _autenticar(credentials.credentials, TIPO_PERSONAL, db, request)
    personal = personal_repository.obtener_por_id(db, personal_id)
    # Una cuenta desactivada pierde el acceso de inmediato, aunque su
    # token todavía no haya vencido.
    if personal is None or not personal.activo:
        raise _no_autorizado("Su cuenta no está activa. Comuníquese con un administrador.")
    return personal


def requiere(*permisos: Permiso) -> Callable[..., Personal]:
    """
    Dependencia: personal autenticado con ALGUNO de los permisos indicados.
    Si no, 403, y el intento queda en los eventos de seguridad.
    """

    def dependencia(
        request: Request, personal: Personal = Depends(get_current_personal), db: Session = Depends(get_db)
    ) -> Personal:
        if not any(tiene_permiso(personal.rol, permiso) for permiso in permisos):
            seguridad_service.registrar(
                db, "acceso_denegado", seguridad_service.MEDIA, "personal",
                "Intentó usar una función que su rol no permite", request=request,
                sujeto_id=personal.id, sujeto_nombre=seguridad_service.nombre_personal(personal),
                identificador=personal.correo,
                detalle=f"{request.method} {request.url.path} (requiere: {', '.join(p.value for p in permisos)})",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Su rol no tiene permiso para realizar esta acción.",
            )
        return personal

    return dependencia
