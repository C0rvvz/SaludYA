"""
Cita — HU-16 (confirmar cita) y HU-17 (certificado/comprobante).

HU-16 y HU-17 son historias independientes (así lo definiste), pero
comparten la misma fila de datos: HU-16 la crea con estado CONFIRMADA,
HU-17 le agrega los campos propios del comprobante (número, canal de
envío, fecha de generación). No se duplica en una tabla aparte porque
todo lo demás que debe mostrar el comprobante (nombre del paciente,
especialidad, profesional, sede, modalidad, fecha, hora) ya se puede
obtener por JOIN a través de disponibilidad -> especialista y de
paciente, sin repetir datos.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EstadoCita(str, enum.Enum):
    CONFIRMADA = "confirmada"
    # (cancelada/reprogramada pertenecen a HU-20/HU-21, fuera de Sprint 1;
    # se agrega ese valor cuando esa historia entre a un sprint)


class CanalContacto(str, enum.Enum):
    WHATSAPP = "whatsapp"
    SMS = "sms"
    CORREO = "correo"
    LLAMADA = "llamada"


class Cita(Base):
    __tablename__ = "citas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    disponibilidad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("disponibilidad.id"), unique=True, nullable=False
    )

    # --- HU-16 ---
    canal_recordatorio: Mapped[CanalContacto] = mapped_column(
        SAEnum(CanalContacto, name="canal_contacto"), nullable=False
    )
    estado: Mapped[EstadoCita] = mapped_column(
        SAEnum(EstadoCita, name="estado_cita"), default=EstadoCita.CONFIRMADA, nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # --- HU-17: campos propios del comprobante ---
    numero_comprobante: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    canal_envio_comprobante: Mapped[CanalContacto | None] = mapped_column(
        SAEnum(CanalContacto, name="canal_contacto"), nullable=True
    )
    comprobante_generado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    paciente: Mapped["Paciente"] = relationship(back_populates="citas")
    disponibilidad: Mapped["Disponibilidad"] = relationship(back_populates="cita")
