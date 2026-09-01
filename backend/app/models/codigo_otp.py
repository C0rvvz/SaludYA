"""
Código OTP — HU-02, HU-03, HU-04.

Reglas de negocio ya definidas por ti:
- duración del código: 5 minutos (OTP_EXPIRE_MINUTES, Parte de OTP);
- máximo de intentos de validación: 3 (OTP_MAX_INTENTOS);
- tiempo mínimo de espera para reenviar: 60 segundos (OTP_REENVIO_SEGUNDOS).

Estos valores se leerán desde settings cuando construyamos el
servicio de OTP (próxima parte) — aquí solo modelamos los campos
donde se registran (código, expiración, intentos consumidos).
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EstadoOTP(str, enum.Enum):
    PENDIENTE = "pendiente"
    USADO = "usado"
    EXPIRADO = "expirado"
    INVALIDADO = "invalidado"  # cuando se solicita un nuevo código (HU-04)


class CanalOTP(str, enum.Enum):
    WHATSAPP = "whatsapp"


class CodigoOTP(Base):
    __tablename__ = "codigos_otp"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )

    codigo: Mapped[str] = mapped_column(String(6), nullable=False)
    canal: Mapped[CanalOTP] = mapped_column(
        SAEnum(CanalOTP, name="canal_otp", values_callable=lambda x: [e.value for e in x]), default=CanalOTP.WHATSAPP, nullable=False
    )
    estado: Mapped[EstadoOTP] = mapped_column(
        SAEnum(EstadoOTP, name="estado_otp", values_callable=lambda x: [e.value for e in x]), default=EstadoOTP.PENDIENTE, nullable=False
    )
    intentos_realizados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    paciente: Mapped["Paciente"] = relationship(back_populates="codigos_otp")
