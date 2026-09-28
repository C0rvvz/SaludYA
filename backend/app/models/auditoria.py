"""
Registro de auditoría — HU-80 a HU-85 (y el "debe quedar registrado"
de HU-36, HU-37, HU-38, HU-40 y HU-43).

Cada acción sobre una cita queda aquí: quién la hizo (paciente,
personal o el sistema), qué hizo, sobre qué cita y paciente, y el
estado antes y después. Es de solo escritura: nunca se modifica ni se
borra un registro.

El nombre del responsable y los estados se guardan como texto en el
momento de la acción (HU-84: "la relación debe conservarse aunque
posteriormente cambie"), no se recalculan después.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TipoActor(str, enum.Enum):
    PACIENTE = "paciente"
    PERSONAL = "personal"
    SISTEMA = "sistema"


class RegistroAuditoria(Base):
    __tablename__ = "auditoria"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    # --- HU-81: usuario responsable ---
    actor_tipo: Mapped[TipoActor] = mapped_column(
        SAEnum(TipoActor, name="tipo_actor", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_nombre: Mapped[str] = mapped_column(String(150), nullable=False)

    # --- HU-82: acción realizada ---
    accion: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    descripcion: Mapped[str] = mapped_column(String(300), nullable=False)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- HU-84: solicitud (cita) relacionada ---
    cita_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), nullable=True, index=True
    )
    paciente_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=True, index=True
    )
    numero_comprobante: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # --- HU-83: estado anterior y nuevo (texto visible en ese momento) ---
    estado_anterior: Mapped[str | None] = mapped_column(String(60), nullable=True)
    estado_nuevo: Mapped[str | None] = mapped_column(String(60), nullable=True)

    cita: Mapped["Cita | None"] = relationship()
    paciente: Mapped["Paciente | None"] = relationship()
