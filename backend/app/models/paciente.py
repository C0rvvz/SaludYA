"""
Modelo de Paciente.

Cubre HU-01 (existencia por cédula), HU-05/HU-06 (registro y datos
personales), HU-07 (aceptación de tratamiento de datos) y HU-08
(estado de afiliación a EPS, validado mediante mock académico).
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TipoDocumento(str, enum.Enum):
    CEDULA_CIUDADANIA = "cedula_ciudadania"
    CEDULA_EXTRANJERIA = "cedula_extranjeria"
    TARJETA_IDENTIDAD = "tarjeta_identidad"
    PASAPORTE = "pasaporte"


class EstadoAfiliacion(str, enum.Enum):
    PENDIENTE = "pendiente"          # todavía no se ha consultado (HU-08)
    ACTIVA = "activa"
    NO_ENCONTRADA = "no_encontrada"


class Paciente(Base):
    __tablename__ = "pacientes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # --- HU-01: identificación ---
    tipo_documento: Mapped[TipoDocumento] = mapped_column(
        SAEnum(TipoDocumento, name="tipo_documento"), nullable=False
    )
    numero_documento: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )

    # --- HU-06: datos personales y de contacto ---
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    telefono_whatsapp: Mapped[str] = mapped_column(String(20), nullable=False)
    correo: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # --- HU-07: tratamiento de datos ---
    acepto_tratamiento_datos: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    fecha_aceptacion_tratamiento: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- HU-08: afiliación EPS (mock académico) ---
    eps_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eps.id"), nullable=True
    )
    estado_afiliacion: Mapped[EstadoAfiliacion] = mapped_column(
        SAEnum(EstadoAfiliacion, name="estado_afiliacion"),
        default=EstadoAfiliacion.PENDIENTE,
        nullable=False,
    )

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    eps: Mapped["Eps | None"] = relationship(back_populates="pacientes")
    codigos_otp: Mapped[list["CodigoOTP"]] = relationship(
        back_populates="paciente", cascade="all, delete-orphan"
    )
    citas: Mapped[list["Cita"]] = relationship(back_populates="paciente")
