"""
Servicio de autenticación de paciente.

HU-01 (identificar), HU-02 (enviar OTP) de la Parte 4.
HU-03 (validar código) y HU-04 (reenviar) en esta Parte 5.
"""

from sqlalchemy.orm import Session

from app.models.codigo_otp import CodigoOTP
from app.models.paciente import Paciente
from app.repositories import paciente_repository
from app.services import otp_service
from app.services.exceptions import PacienteNoRegistradoError


def identificar_paciente(db: Session, numero_documento: str) -> Paciente:
    # --- HU-01, criterio 3 ---
    paciente = paciente_repository.obtener_por_numero_documento(db, numero_documento)
    if paciente is None:
        # --- HU-01, criterio 4: informar al paciente cuando no está registrado ---
        raise PacienteNoRegistradoError(
            f"No encontramos ningún paciente registrado con el documento "
            f"{numero_documento}."
        )
    return paciente


def iniciar_envio_otp(db: Session, numero_documento: str) -> tuple[Paciente, CodigoOTP]:
    paciente = identificar_paciente(db, numero_documento)
    otp = otp_service.generar_y_enviar_otp(db, paciente)
    return paciente, otp


def validar_codigo(db: Session, numero_documento: str, codigo: str) -> Paciente:
    """HU-03: valida el código del paciente identificado por su cédula."""
    paciente = identificar_paciente(db, numero_documento)
    otp_service.validar_otp(db, paciente, codigo)
    return paciente


def reenviar_otp(db: Session, numero_documento: str) -> tuple[Paciente, CodigoOTP]:
    """
    HU-04: reenviar código. Reutiliza exactamente la misma lógica de
    generar_y_enviar_otp() de la Parte 4 -- invalidar el anterior +
    generar y enviar uno nuevo es precisamente lo que pide esta historia.
    """
    return iniciar_envio_otp(db, numero_documento)
