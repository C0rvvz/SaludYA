"""
Catálogo de EPS — HU-08 (Validar afiliación a EPS).

Es un catálogo simulado para el mock académico: no hay integración
real con ninguna EPS (ver Sección 14 de la auditoría). Sirve para que
el paciente elija su EPS en el registro y para simular una respuesta
de "afiliación activa" / "no encontrada".
"""

import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Eps(Base):
    __tablename__ = "eps"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

    pacientes: Mapped[list["Paciente"]] = relationship(back_populates="eps")
