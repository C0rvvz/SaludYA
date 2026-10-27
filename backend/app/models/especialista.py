"""
Especialista — HU-12 (seleccionar especialista).

DECISIÓN DE MODELADO (definida por ti): un especialista puede estar
asociado a varias sedes y varias modalidades, no una sola como en el
prototipo original. Por eso "sedes" y "modalidades" son relaciones
muchos-a-muchos (tablas de asociación), no columnas simples.

Estas tablas de asociación dicen QUÉ sedes/modalidades ofrece el
especialista EN GENERAL. La franja horaria concreta (con su sede y
modalidad específicas) vive en Disponibilidad — ver ese modelo.

TurnoEspecialista: su horario semanal, como lo maneja una IPS (p. ej.
"lunes de 7:00 a 12:00 en Sede Poblado, presencial, citas de 30 min").
Las franjas se generan de los turnos (disponibilidad_service), así que un
especialista nunca queda a la misma hora en dos sedes. Sus sedes y
modalidades salen de sus turnos (especialistas_service).
"""

import enum
import uuid
from datetime import datetime, time, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, SmallInteger, String, ForeignKey, Table, Column, Time, Enum as SAEnum, text
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
    registro_medico: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Uno inactivo ya no recibe horarios nuevos; sus citas ya agendadas se conservan.
    activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    # "semilla" (catálogo inicial), "ips" (llegó en una actualización de la IPS) o "manual" (lo agregó el personal).
    origen: Mapped[str] = mapped_column(String(10), default="manual", server_default="semilla", nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    especialidad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("especialidades.id"), nullable=False
    )
    especialidad: Mapped["Especialidad"] = relationship(back_populates="especialistas")

    # La EPS de cuyos afiliados es médico (ver Eps y alianzas_eps). Siempre se
    # muestra con él: se carga de una vez.
    eps_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eps.id"), nullable=False, index=True
    )
    eps: Mapped["Eps"] = relationship(lazy="joined")

    sedes: Mapped[list["Sede"]] = relationship(
        secondary=especialista_sedes, back_populates="especialistas"
    )

    disponibilidad: Mapped[list["Disponibilidad"]] = relationship(
        back_populates="especialista"
    )

    turnos: Mapped[list["TurnoEspecialista"]] = relationship(
        back_populates="especialista",
        cascade="all, delete-orphan",
        order_by="(TurnoEspecialista.dia_semana, TurnoEspecialista.hora_inicio)",
    )


class TurnoEspecialista(Base):
    """Un bloque del horario semanal: día, sede, modalidad, desde, hasta y duración de cada cita."""

    __tablename__ = "turnos_especialista"
    __table_args__ = (
        CheckConstraint("dia_semana BETWEEN 0 AND 5", name="ck_turnos_dia_semana"),
        CheckConstraint("hora_inicio < hora_fin", name="ck_turnos_horas"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    especialista_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("especialistas.id"), nullable=False, index=True
    )
    dia_semana: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0 = lunes ... 5 = sábado
    sede_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sedes.id"), nullable=False)
    modalidad: Mapped[Modalidad] = mapped_column(
        SAEnum(Modalidad, name="modalidad", values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fin: Mapped[time] = mapped_column(Time, nullable=False)
    duracion_minutos: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    especialista: Mapped["Especialista"] = relationship(back_populates="turnos")
    sede: Mapped["Sede"] = relationship()
