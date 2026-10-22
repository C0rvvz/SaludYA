"""
Endpoints de autenticación de paciente.

HU-01: POST /auth/paciente/identificar
HU-02: POST /auth/paciente/otp/enviar
HU-03: POST /auth/paciente/otp/validar  (ahora emite el JWT)
HU-04: POST /auth/paciente/otp/reenviar
RNF-17: POST /auth/paciente/salir        cierra la sesión en el servidor

En modo demostración (WhatsApp simulado y entorno de desarrollo),
enviar y reenviar también devuelven el código en `codigo_demo`, para
que la pantalla de ingreso lo muestre.

Seguridad: cada conexión (IP) tiene un límite de intentos (ver
core/limite_intentos.py) y el token pertenece a una sesión del servidor
(RNF-17, RNF-24).

GET /auth/paciente/me: datos del paciente de la sesión; el frontend
también lo usa para mantener la sesión activa mientras hay actividad.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core import limite_intentos
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_paciente, sesion_del_paciente
from app.core.limite_intentos import ip_de, limitar
from app.core.security import TIPO_PACIENTE, crear_access_token
from app.models.codigo_otp import CodigoOTP
from app.models.paciente import Paciente
from app.models.sesion import Sesion
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
from app.services import auth_service, sesion_service
from app.services.exceptions import (
    OtpExpiradoError,
    OtpIncorrectoError,
    OtpIntentosSuperadosError,
    OtpNoEncontradoError,
    PacienteNoRegistradoError,
    ReenvioMuyProntoError,
)

router = APIRouter(prefix="/auth/paciente", tags=["Autenticación"])

_LIMITE_INGRESO = Depends(limitar(limite_intentos.INGRESO_PACIENTE))


def _codigo_demo(otp: CodigoOTP) -> str | None:
    return otp.codigo if settings.codigo_otp_en_pantalla else None


def _enmascarar_telefono(telefono: str) -> str:
    # HU-02, criterio 4: el código no debe ser visible; por la misma
    # razón, tampoco exponemos el número de WhatsApp completo.
    return f"******{telefono[-4:]}"


@router.post(
    "/identificar",
    response_model=IdentificarPacienteResponse,
    # Más estricto: con muchos intentos se podría averiguar qué documentos están registrados.
    dependencies=[Depends(limitar(limite_intentos.IDENTIFICAR_PACIENTE, limite_intentos.INGRESO_PACIENTE))],
)
def identificar_paciente(datos: IdentificarPacienteRequest, db: Session = Depends(get_db)):
    try:
        auth_service.identificar_paciente(db, datos.numero_documento)
    except PacienteNoRegistradoError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return IdentificarPacienteResponse(registrado=True, mensaje="Documento registrado.")


@router.post(
    "/otp/enviar",
    response_model=EnviarOTPResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_LIMITE_INGRESO],
)
def enviar_otp(datos: EnviarOTPRequest, db: Session = Depends(get_db)):
    try:
        paciente, otp = auth_service.iniciar_envio_otp(db, datos.numero_documento)
    except PacienteNoRegistradoError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ReenvioMuyProntoError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))

    return EnviarOTPResponse(
        enviado=True,
        telefono_enmascarado=_enmascarar_telefono(paciente.telefono_whatsapp),
        expira_en_minutos=settings.otp_expire_minutes,
        mensaje="Te enviamos un código de verificación por WhatsApp.",
        codigo_demo=_codigo_demo(otp),
    )


@router.post("/otp/validar", response_model=ValidarOTPResponse, dependencies=[_LIMITE_INGRESO])
def validar_otp(datos: ValidarOTPRequest, request: Request, db: Session = Depends(get_db)):
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
    # RNF-17: la sesión nueva cierra cualquier otra abierta de este paciente.
    sesion = sesion_service.abrir(
        db, TIPO_PACIENTE, paciente.id, ip_de(request), request.headers.get("user-agent")
    )
    token, _expira = crear_access_token(paciente.id, sesion.id, rol="paciente")

    return ValidarOTPResponse(
        validado=True,
        access_token=token,
        expira_en_minutos=settings.jwt_expire_minutes,
        paciente_id=paciente.id,
        nombre=paciente.nombre,
        mensaje="Código validado correctamente. Sesión iniciada.",
    )


@router.post(
    "/otp/reenviar",
    response_model=ReenviarOTPResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_LIMITE_INGRESO],
)
def reenviar_otp(datos: ReenviarOTPRequest, db: Session = Depends(get_db)):
    try:
        paciente, otp = auth_service.reenviar_otp(db, datos.numero_documento)
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
        codigo_demo=_codigo_demo(otp),
    )


@router.post("/salir", status_code=status.HTTP_204_NO_CONTENT)
def salir(sesion: Sesion = Depends(sesion_del_paciente), db: Session = Depends(get_db)):
    """Cierra la sesión en el servidor: el token deja de servir aunque alguien lo haya copiado."""
    sesion_service.cerrar(db, sesion.id)


@router.get("/me", response_model=MePacienteResponse)
def obtener_paciente_actual(paciente: Paciente = Depends(get_current_paciente)):
    """
    Datos del paciente de la sesión. Como toda petición con sesión, cuenta
    como actividad (RNF-24): el frontend lo llama mientras la persona usa
    la página aunque no cambie de pantalla.
    """
    return MePacienteResponse(
        id=paciente.id,
        nombre=paciente.nombre,
        numero_documento=paciente.numero_documento,
        telefono_whatsapp=paciente.telefono_whatsapp,
        correo=paciente.correo,
        eps=paciente.eps.nombre if paciente.eps else None,
    )
