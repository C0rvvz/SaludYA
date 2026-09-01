"""
Catálogo de Especialidades — HU-09 (Seleccionar especialidad).
"""

import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Especialidad(Base):
    __tablename__ = "especialidades"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)

    especialistas: Mapped[list["Especialista"]] = relationship(
        back_populates="especialidad"
    )
