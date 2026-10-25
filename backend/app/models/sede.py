"""
Catálogo de Sedes — HU-13 (Seleccionar sede) y RF-89 (el administrador
las crea, edita y cierra; ver sedes_service).
"""

import uuid

from sqlalchemy import Boolean, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Sede(Base):
    __tablename__ = "sedes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    ciudad: Mapped[str] = mapped_column(String(80), nullable=False)
    direccion: Mapped[str | None] = mapped_column(String(150), nullable=True)  # para "Cómo llegar"
    # Una sede cerrada no se ofrece ni se usa en horarios nuevos; sus citas ya agendadas se conservan.
    activa: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)

    especialistas: Mapped[list["Especialista"]] = relationship(
        secondary="especialista_sedes", back_populates="sedes"
    )
