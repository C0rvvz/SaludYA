"""
Eventos de seguridad — panel "Seguridad" del administrador (tipo SIEM).

Todo lo que dice algo sobre quién intenta entrar y qué intenta hacer:
ingresos exitosos y fallidos, cuentas bloqueadas, intentos de entrar a
algo sin permiso, tokens alterados, sesiones reemplazadas o cerradas por
un administrador. Con ellos, seguridad_service arma las alertas.

Como la auditoría, es de solo escritura: nunca se modifica ni se borra un
evento. Nunca se guardan contraseñas ni códigos de verificación, y del
documento del paciente solo los últimos 4 dígitos.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EventoSeguridad(Base):
    __tablename__ = "eventos_seguridad"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # ver seguridad_service.TIPOS
    severidad: Mapped[str] = mapped_column(String(10), nullable=False)  # "info", "media" o "alta"
    ambito: Mapped[str] = mapped_column(String(10), nullable=False)  # "paciente" o "personal": dónde ocurrió

    # Quién: la persona si se sabe (su nombre de ese momento) y con qué se identificó.
    sujeto_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    sujeto_nombre: Mapped[str | None] = mapped_column(String(150), nullable=True)
    identificador: Mapped[str | None] = mapped_column(String(150), nullable=True)  # correo, o documento enmascarado

    # Desde dónde
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    dispositivo: Mapped[str | None] = mapped_column(String(200), nullable=True)

    descripcion: Mapped[str] = mapped_column(String(300), nullable=False)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)
