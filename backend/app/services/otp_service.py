"""
Servicio de OTP — HU-02 (generar y enviar) y, por diseño, reutilizable
tal cual para HU-04 (reenviar) en la Parte 5: volver a llamar a
generar_y_enviar_otp() ya invalida el código anterior y crea uno
nuevo, que es exactamente lo que pide HU-04. La Parte 5 solo necesita
decidir si expone un endpoint con otro nombre o reutiliza este mismo.
"""

import random
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.whatsapp.client import enviar_mensaje_whatsapp
from app.models.codigo_otp import CanalOTP, CodigoOTP, EstadoOTP
from app.models.paciente import Paciente
from app.repositories import otp_repository
from app.services.exceptions import (
    OtpExpiradoError,
    OtpIncorrectoError,
    OtpIntentosSuperadosError,
    OtpNoEncontradoError,
    ReenvioMuyProntoError,
)


def _generar_codigo() -> str:
    return f"{random.randint(0, 999999):06d}"


def generar_y_enviar_otp(db: Session, paciente: Paciente) -> CodigoOTP:
    # --- Tiempo mínimo de espera entre envíos (60s, ya definido) ---
    # OJO: el enfriamiento se aplica según el tiempo transcurrido desde
    # que se CREÓ el último código, sin importar en qué estado quedó
    # (pendiente, expirado o invalidado por exceso de intentos). Si
    # dependiera de que siga PENDIENTE, alguien podría fallar el código
    # a propósito para invalidarlo y saltarse el enfriamiento.
    ultimo = otp_repository.obtener_ultimo_otp(db, paciente.id)
    if ultimo is not None:
        segundos_transcurridos = (datetime.now(timezone.utc) - ultimo.creado_en).total_seconds()
        if segundos_transcurridos < settings.otp_reenvio_segundos:
            espera_restante = int(settings.otp_reenvio_segundos - segundos_transcurridos)
            raise ReenvioMuyProntoError(
                f"Debes esperar {espera_restante} segundos antes de solicitar "
                "un nuevo código."
            )

    # --- HU-04, criterio 3 (aplicado también aquí): el código anterior
    # pendiente deja de ser válido al generar uno nuevo ---
    otp_repository.invalidar_pendientes(db, paciente.id)

    codigo = _generar_codigo()
    ahora = datetime.now(timezone.utc)

    # --- HU-02, criterio 2: el código es temporal ---
    nuevo_otp = CodigoOTP(
        paciente_id=paciente.id,
        codigo=codigo,
        canal=CanalOTP.WHATSAPP,
        estado=EstadoOTP.PENDIENTE,
        intentos_realizados=0,
        creado_en=ahora,
        expira_en=ahora + timedelta(minutes=settings.otp_expire_minutes),
    )
    nuevo_otp = otp_repository.crear_otp(db, nuevo_otp)

    # --- HU-02, criterio 1: enviar el código al WhatsApp asociado ---
    mensaje = (
        f"Tu código de verificación de SaludYA es: {codigo}. "
        f"Vence en {settings.otp_expire_minutes} minutos. No lo compartas con nadie."
    )
    enviar_mensaje_whatsapp(paciente.telefono_whatsapp, mensaje)

    return nuevo_otp


def validar_otp(db: Session, paciente: Paciente, codigo_ingresado: str) -> CodigoOTP:
    """
    Valida el código OTP más reciente del paciente -- HU-03.

    Reglas, en orden:
    1. Debe existir un código pendiente (si no, hay que solicitar uno).
    2. No debe haber expirado (criterio 2).
    3. Si el código no coincide, se cuenta como intento fallido; al
       llegar a OTP_MAX_INTENTOS (ya definido: 3) el código queda
       invalidado y hay que solicitar uno nuevo.
    4. Si coincide, se marca USADO (criterio 3: "permitir el acceso" --
       el acceso real, vía JWT, se agrega en la Parte 6; aquí solo se
       confirma que la validación fue exitosa).
    """
    otp = otp_repository.obtener_ultimo_otp(db, paciente.id)

    if otp is None or otp.estado != EstadoOTP.PENDIENTE:
        raise OtpNoEncontradoError(
            "No hay ningún código pendiente de validación. Solicita uno nuevo."
        )

    ahora = datetime.now(timezone.utc)
    if ahora > otp.expira_en:
        otp.estado = EstadoOTP.EXPIRADO
        db.commit()
        raise OtpExpiradoError("El código expiró. Solicita uno nuevo.")

    if otp.codigo != codigo_ingresado:
        otp.intentos_realizados += 1

        if otp.intentos_realizados >= settings.otp_max_intentos:
            otp.estado = EstadoOTP.INVALIDADO
            db.commit()
            raise OtpIntentosSuperadosError(
                f"Superaste el máximo de {settings.otp_max_intentos} intentos. "
                "Solicita un nuevo código."
            )

        db.commit()
        intentos_restantes = settings.otp_max_intentos - otp.intentos_realizados
        raise OtpIncorrectoError(
            f"Código incorrecto. Te quedan {intentos_restantes} intento(s).",
            intentos_restantes=intentos_restantes,
        )

    # --- HU-03, criterio 3: código correcto ---
    otp.estado = EstadoOTP.USADO
    db.commit()
    db.refresh(otp)
    return otp
