"""
Especialista — HU-12 (seleccionar especialista).

DECISIÓN DE MODELADO (definida por ti): un especialista puede estar
asociado a varias sedes y varias modalidades, no una sola como en el
prototipo original. Por eso "sedes" y "modalidades" son relaciones
muchos-a-muchos (tablas de asociación), no columnas simples.

Estas tablas de asociación dicen QUÉ sedes/modalidades ofrece el
especialista EN GENERAL. La franja horaria concreta (con su sede y
modalidad específicas) vive en Disponibilidad — ver ese modelo.
"""

import enum
import uuid

from sqlalchemy import String, ForeignKey, Table, Column, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Modalidad(str, enum.Enum):
    PRESENCIAL = "presencial"
    VIRTUAL = "virtual"


# Tabla de asociación: qué sedes ofrece cada especialista (N:N)
especialista_sedes = Table(
    "especialista_sedes",
    Base.metadata,
    Column("especialista_id", UUID(as_uuid=True), ForeignKey("especialistas.id"), primary_key=True),
    Column("sede_id", UUID(as_uuid=True), ForeignKey("sedes.id"), primary_key=True),
)

# Tabla de asociación: qué modalidades ofrece cada especialista (N:N)
especialista_modalidades = Table(
    "especialista_modalidades",
    Base.metadata,
    Column("especialista_id", UUID(as_uuid=True), ForeignKey("especialistas.id"), primary_key=True),
    Column("modalidad", SAEnum(Modalidad, name="modalidad", values_callable=lambda x: [e.value for e in x]), primary_key=True),
)


class Especialista(Base):
    __tablename__ = "especialistas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)

    especialidad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("especialidades.id"), nullable=False
    )
    especialidad: Mapped["Especialidad"] = relationship(back_populates="especialistas")

    sedes: Mapped[list["Sede"]] = relationship(
        secondary=especialista_sedes, back_populates="especialistas"
    )

    disponibilidad: Mapped[list["Disponibilidad"]] = relationship(
        back_populates="especialista"
    )
