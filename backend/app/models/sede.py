"""
Catálogo de Sedes — HU-13 (Seleccionar sede).
"""

import uuid

from sqlalchemy import String
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

    especialistas: Mapped[list["Especialista"]] = relationship(
        secondary="especialista_sedes", back_populates="sedes"
    )
