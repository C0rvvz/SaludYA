"""
Catálogo de EPS — HU-08 (Validar afiliación a EPS).

Es un catálogo simulado para el mock académico: no hay integración
real con ninguna EPS (ver Sección 14 de la auditoría). Sirve para que
el paciente elija su EPS en el registro y para simular una respuesta
de "afiliación activa" / "no encontrada".

Cada médico atiende a los afiliados de una EPS (Especialista.eps). Dos EPS
aliadas comparten sus médicos (alianzas_eps): el afiliado de una puede
agendar con los de la otra. Se guarda una fila por cada sentido.
"""

import uuid

from sqlalchemy import CheckConstraint, Column, ForeignKey, String, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# EPS aliadas: comparten sus médicos. Una fila por sentido (Sura -> Savia y Savia -> Sura).
alianzas_eps = Table(
    "alianzas_eps",
    Base.metadata,
    Column("eps_id", UUID(as_uuid=True), ForeignKey("eps.id"), primary_key=True),
    Column("aliada_id", UUID(as_uuid=True), ForeignKey("eps.id"), primary_key=True),
    CheckConstraint("eps_id <> aliada_id", name="ck_alianzas_eps_distintas"),
)


class Eps(Base):
    __tablename__ = "eps"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    # Para mostrar junto al médico: "Sura", "Savia", "SOS"...
    nombre_corto: Mapped[str] = mapped_column(String(30), nullable=False)

    pacientes: Mapped[list["Paciente"]] = relationship(back_populates="eps")
