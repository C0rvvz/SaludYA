"""
Lista de espera — HU-19 (posición), HU-31 (aviso de cupo liberado) y
HU-32 (aceptar o rechazar el cupo); la usa también el personal (Fase D).

- SolicitudEspera: el paciente espera una cita de una especialidad, con
  sus preferencias (HU-55: jornada y sedes; modalidad), su canal (HU-57)
  y una prioridad médica que define el personal (HU-56).
- OfertaEspera: cada cupo que se le ofreció, reservado a su nombre hasta
  `expira_en`. Guardarlas todas evita volver a ofrecerle un cupo que ya
  rechazó o dejó vencer.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Index, Table, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.cita import CanalContacto
from app.models.especialista import Modalidad


def _enum(clase, nombre: str):
    return SAEnum(clase, name=nombre, values_callable=lambda x: [e.value for e in x])


class Jornada(str, enum.Enum):
    MANANA = "manana"  # antes del mediodía
    TARDE = "tarde"
    CUALQUIERA = "cualquiera"


class PrioridadMedica(str, enum.Enum):
    NORMAL = "normal"
    ALTA = "alta"
    URGENTE = "urgente"


class EstadoSolicitud(str, enum.Enum):
    EN_ESPERA = "en_espera"
    CUPO_OFRECIDO = "cupo_ofrecido"
    ASIGNADA = "asignada"  # aceptó un cupo: ya tiene su cita
    CANCELADA = "cancelada"  # salió de la lista


class EstadoOferta(str, enum.Enum):
    PENDIENTE = "pendiente"
    ACEPTADA = "aceptada"
    RECHAZADA = "rechazada"
    VENCIDA = "vencida"


# HU-55, criterio 2: sedes que acepta el paciente (al menos una).
solicitud_espera_sedes = Table(
    "solicitud_espera_sedes",
    Base.metadata,
    Column("solicitud_id", UUID(as_uuid=True), ForeignKey("solicitudes_espera.id"), primary_key=True),
    Column("sede_id", UUID(as_uuid=True), ForeignKey("sedes.id"), primary_key=True),
)


class SolicitudEspera(Base):
    __tablename__ = "solicitudes_espera"
    __table_args__ = (
        # Una sola solicitud activa por paciente y especialidad.
        Index(
            "uq_solicitudes_espera_activa",
            "paciente_id",
            "especialidad_id",
            unique=True,
            postgresql_where=text("estado IN ('en_espera', 'cupo_ofrecido')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    especialidad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("especialidades.id"), nullable=False, index=True
    )
    jornada: Mapped[Jornada] = mapped_column(_enum(Jornada, "jornada"), nullable=False)
    modalidad: Mapped[Modalidad | None] = mapped_column(_enum(Modalidad, "modalidad"), nullable=True)  # sin valor: cualquier modalidad
    canal: Mapped[CanalContacto] = mapped_column(_enum(CanalContacto, "canal_contacto"), nullable=False)
    prioridad: Mapped[PrioridadMedica] = mapped_column(
        _enum(PrioridadMedica, "prioridad_medica"), default=PrioridadMedica.NORMAL, nullable=False
    )
    estado: Mapped[EstadoSolicitud] = mapped_column(
        _enum(EstadoSolicitud, "estado_solicitud_espera"), default=EstadoSolicitud.EN_ESPERA, nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    cerrada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cita_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("citas.id"), nullable=True)

    paciente: Mapped["Paciente"] = relationship()
    especialidad: Mapped["Especialidad"] = relationship()
    sedes: Mapped[list["Sede"]] = relationship(secondary=solicitud_espera_sedes)
    cita: Mapped["Cita | None"] = relationship()
    ofertas: Mapped[list["OfertaEspera"]] = relationship(
        back_populates="solicitud", order_by="OfertaEspera.ofrecida_en"
    )

    @property
    def oferta_vigente(self) -> "OfertaEspera | None":
        return next((o for o in self.ofertas if o.estado == EstadoOferta.PENDIENTE), None)


class OfertaEspera(Base):
    __tablename__ = "ofertas_espera"
    __table_args__ = (
        # Un horario se le ofrece a una sola solicitud a la vez.
        Index(
            "uq_ofertas_espera_pendiente",
            "disponibilidad_id",
            unique=True,
            postgresql_where=text("estado = 'pendiente'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    solicitud_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("solicitudes_espera.id"), nullable=False, index=True
    )
    disponibilidad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("disponibilidad.id"), nullable=False
    )
    ofrecida_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    estado: Mapped[EstadoOferta] = mapped_column(
        _enum(EstadoOferta, "estado_oferta_espera"), default=EstadoOferta.PENDIENTE, nullable=False
    )
    respondida_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    solicitud: Mapped["SolicitudEspera"] = relationship(back_populates="ofertas")
    disponibilidad: Mapped["Disponibilidad"] = relationship()
