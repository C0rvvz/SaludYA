"""
Endpoints de autenticación de paciente.

HU-01: POST /auth/paciente/identificar
HU-02: POST /auth/paciente/otp/enviar
HU-03: POST /auth/paciente/otp/validar  (ahora emite el JWT)
HU-04: POST /auth/paciente/otp/reenviar

Endpoint de prueba (no corresponde a ninguna HU por sí solo, sirve
para verificar que el JWT funciona antes de construir la Parte 7):
GET /auth/paciente/me
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_paciente
from app.core.security import crear_access_token
from app.models.paciente import Paciente
from app.schemas.auth import (
    EnviarOTPRequest,
    EnviarOTPResponse,
    IdentificarPacienteRequest,
    IdentificarPacienteResponse,
    MePacienteResponse,
    ReenviarOTPRequest,
    ReenviarOTPResponse,
    ValidarOTPRequest,
    ValidarOTPResponse,
)
from app.services import auth_service
from app.services.exceptions import (
    OtpExpiradoError,
    OtpIncorrectoError,
    OtpIntentosSuperadosError,
    OtpNoEncontradoError,
    PacienteNoRegistradoError,
    ReenvioMuyProntoError,
)

router = APIRouter(prefix="/auth/paciente", tags=["Autenticación"])


def _enmascarar_telefono(telefono: str) -> str:
    # HU-02, criterio 4: el código no debe ser visible; por la misma
    # razón, tampoco exponemos el número de WhatsApp completo.
    return f"******{telefono[-4:]}"


@router.post("/identificar", response_model=IdentificarPacienteResponse)
def identificar_paciente(datos: IdentificarPacienteRequest, db: Session = Depends(get_db)):
    try:
        paciente = auth_service.identificar_paciente(db, datos.numero_documento)
    except PacienteNoRegistradoError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return IdentificarPacienteResponse(
        registrado=True,
        nombre=paciente.nombre,
        mensaje=f"Bienvenido de nuevo, {paciente.nombre}.",
    )


@router.post(
    "/otp/enviar", response_model=EnviarOTPResponse, status_code=status.HTTP_201_CREATED
)
def enviar_otp(datos: EnviarOTPRequest, db: Session = Depends(get_db)):
    try:
        paciente, _otp = auth_service.iniciar_envio_otp(db, datos.numero_documento)
    except PacienteNoRegistradoError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ReenvioMuyProntoError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))

    return EnviarOTPResponse(
        enviado=True,
        telefono_enmascarado=_enmascarar_telefono(paciente.telefono_whatsapp),
        expira_en_minutos=settings.otp_expire_minutes,
        mensaje="Te enviamos un código de verificación por WhatsApp.",
    )


@router.post("/otp/validar", response_model=ValidarOTPResponse)
def validar_otp(datos: ValidarOTPRequest, db: Session = Depends(get_db)):
    try:
        paciente = auth_service.validar_codigo(db, datos.numero_documento, datos.codigo)
    except PacienteNoRegistradoError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except OtpNoEncontradoError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except OtpExpiradoError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except OtpIncorrectoError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except OtpIntentosSuperadosError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))

    # --- HU-03, criterio 3: código correcto -> se emite el JWT que da acceso ---
    token, _expira = crear_access_token(paciente.id, rol="paciente")

    return ValidarOTPResponse(
        validado=True,
        access_token=token,
        expira_en_minutos=settings.jwt_expire_minutes,
        paciente_id=paciente.id,
        nombre=paciente.nombre,
        mensaje="Código validado correctamente. Sesión iniciada.",
    )


@router.post(
    "/otp/reenviar", response_model=ReenviarOTPResponse, status_code=status.HTTP_201_CREATED
)
def reenviar_otp(datos: ReenviarOTPRequest, db: Session = Depends(get_db)):
    try:
        paciente, _otp = auth_service.reenviar_otp(db, datos.numero_documento)
    except PacienteNoRegistradoError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ReenvioMuyProntoError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))

    # --- HU-04, criterio 4: informar que se generó un nuevo código ---
    return ReenviarOTPResponse(
        reenviado=True,
        telefono_enmascarado=_enmascarar_telefono(paciente.telefono_whatsapp),
        expira_en_minutos=settings.otp_expire_minutes,
        mensaje="Se generó y envió un nuevo código de verificación.",
    )


@router.get("/me", response_model=MePacienteResponse)
def obtener_paciente_actual(paciente: Paciente = Depends(get_current_paciente)):
    """
    Endpoint de prueba: no corresponde a ninguna HU por sí solo. Sirve
    para verificar que el JWT protege endpoints correctamente antes de
    construir la Parte 7, que sí lo usará de verdad.
    """
    return MePacienteResponse(
        id=paciente.id,
        nombre=paciente.nombre,
        numero_documento=paciente.numero_documento,
        telefono_whatsapp=paciente.telefono_whatsapp,
        correo=paciente.correo,
    )
