"""
Disponibilidad — HU-10 (buscar disponibilidad), HU-15 (seleccionar
fecha y hora), y soporte de HU-13/HU-14 (sede y modalidad concretas
de esa franja).

Cada fila es UNA franja concreta: este especialista, en esta sede,
en esta modalidad, en esta fecha y hora. No hereda sede/modalidad
del especialista porque el mismo especialista puede tener franjas
distintas en sedes/modalidades distintas (ver nota en especialista.py).
"""

import enum
import uuid
from datetime import date, time

from sqlalchemy import Date, Time, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.especialista import Modalidad


class EstadoDisponibilidad(str, enum.Enum):
    DISPONIBLE = "disponible"
    RESERVADO = "reservado"


class Disponibilidad(Base):
    __tablename__ = "disponibilidad"
    __table_args__ = (
        # No pueden existir dos franjas idénticas (mismo especialista,
        # sede, modalidad, fecha y hora) — evita datos duplicados.
        UniqueConstraint(
            "especialista_id", "sede_id", "modalidad", "fecha", "hora",
            name="uq_disponibilidad_franja",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    especialista_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("especialistas.id"), nullable=False, index=True
    )
    sede_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sedes.id"), nullable=False, index=True
    )
    modalidad: Mapped[Modalidad] = mapped_column(
        SAEnum(Modalidad, name="modalidad"), nullable=False
    )

    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora: Mapped[time] = mapped_column(Time, nullable=False)

    estado: Mapped[EstadoDisponibilidad] = mapped_column(
        SAEnum(EstadoDisponibilidad, name="estado_disponibilidad"),
        default=EstadoDisponibilidad.DISPONIBLE,
        nullable=False,
        index=True,
    )

    especialista: Mapped["Especialista"] = relationship(back_populates="disponibilidad")
    sede: Mapped["Sede"] = relationship()
    cita: Mapped["Cita | None"] = relationship(back_populates="disponibilidad")
