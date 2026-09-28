"""
Servicio de comprobante de cita — HU-17.

HU-16 (Parte 9) y HU-17 son historias independientes, así se definió
explícitamente: HU-16 confirma y registra la cita; este servicio
genera y entrega la evidencia de que quedó confirmada. Se genera
automáticamente justo después de confirmar (coherente con el flujo
definido: Registrar cita -> Generar certificado), pero vive en su
propio servicio, separado de citas_service.py.
"""

import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import Cita
from app.repositories import cita_repository
from app.services.exceptions import CitaNoEncontradaError


def _generar_numero_comprobante() -> str:
    """
    SUPUESTO: ningún criterio de aceptación define el formato exacto
    del número de comprobante -- solo que debe servir como
    "identificador o número de cita". Se usa un código corto y legible.
    """
    return f"SAY-{secrets.token_hex(4).upper()}"


def generar_comprobante(db: Session, cita: Cita) -> Cita:
    # --- HU-17, criterio 1: generar el comprobante después de confirmar ---
    cita.numero_comprobante = _generar_numero_comprobante()

    # --- HU-17, criterio 3: enviarlo al canal correspondiente ---
    # "correspondiente" = el mismo canal que el paciente eligió al
    # confirmar la cita (canal_recordatorio), no uno nuevo que haya
    # que pedirle otra vez.
    cita.canal_envio_comprobante = cita.canal_recordatorio
    cita.comprobante_generado_en = datetime.now(timezone.utc)

    mensaje = (
        f"Tu comprobante de cita SaludYA ({cita.numero_comprobante}) fue generado. "
        f"Estado: CONFIRMADA."
    )
    # SMS/correo/llamada siguen simulados (solo existe integración real
    # con WhatsApp Cloud API): ver integrations/notificaciones.py.
    enviar_por_canal(cita.paciente, cita.canal_recordatorio, mensaje)

    db.commit()
    db.refresh(cita)
    return cita


def obtener_comprobante(db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID) -> Cita:
    """HU-17, criterio 4: poder consultar el comprobante posteriormente."""
    cita = cita_repository.obtener_por_id(db, cita_id)

    if cita is None or cita.paciente_id != paciente_id:
        raise CitaNoEncontradaError(f"No existe ninguna cita con id {cita_id}.")

    return cita
