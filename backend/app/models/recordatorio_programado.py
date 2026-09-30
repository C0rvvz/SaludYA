"""
Recordatorio programado — HU-64 (mensaje escrito) y HU-65 (llamada).

El personal lo deja listo para una fecha y hora; la tarea de fondo lo
envía cuando llega el momento (ver centro_recordatorios_service). Es una
llamada si el canal es "llamada" (se simula, como el resto de canales
sin integración); si no, un mensaje escrito.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.cita import CanalContacto


class EstadoProgramacion(str, enum.Enum):
    PENDIENTE = "pendiente"
    ENVIADO = "enviado"
    FALLIDO = "fallido"


class RecordatorioProgramado(Base):
    __tablename__ = "recordatorios_programados"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # --- HU-64 / HU-65, criterio 1 (y HU-65 criterio 4): el paciente ---
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    # La cita a la que se refiere, si la hay (las plantillas usan sus datos).
    cita_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), nullable=True
    )
    personal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("personal.id"), nullable=False
    )

    # --- HU-64 criterio 2: canal; HU-66: plantilla usada (None = texto libre) ---
    canal: Mapped[CanalContacto] = mapped_column(
        SAEnum(CanalContacto, name="canal_contacto", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    plantilla: Mapped[str | None] = mapped_column(String(40), nullable=True)
    texto: Mapped[str] = mapped_column(Text, nullable=False)

    programado_para: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    estado: Mapped[EstadoProgramacion] = mapped_column(
        SAEnum(EstadoProgramacion, name="estado_programacion", values_callable=lambda x: [e.value for e in x]),
        default=EstadoProgramacion.PENDIENTE,
        nullable=False,
        index=True,
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    enviado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    paciente: Mapped["Paciente"] = relationship()
    cita: Mapped["Cita | None"] = relationship()
    personal: Mapped["Personal"] = relationship()
