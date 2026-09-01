"""
Dependencia de FastAPI para proteger endpoints con JWT.

Uso, a partir de la Parte 7:

    @router.get("/algo-protegido")
    def endpoint(paciente: Paciente = Depends(get_current_paciente)):
        ...
"""

import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decodificar_access_token
from app.models.paciente import Paciente
from app.repositories import paciente_repository

security_scheme = HTTPBearer()


def get_current_paciente(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Paciente:
    token = credentials.credentials

    try:
        payload = decodificar_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión expiró. Inicia sesión de nuevo.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido."
        )

    paciente_id = payload.get("sub")
    if paciente_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

    paciente = paciente_repository.obtener_por_id(db, uuid.UUID(paciente_id))
    if paciente is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Paciente no encontrado."
        )

    return paciente
