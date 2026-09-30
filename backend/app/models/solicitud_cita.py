"""
Solicitud de cita (carta de petición) — HU-76 a HU-79 y los indicadores
de HU-46 (solicitudes) y HU-47 (revisiones).

El paciente la radica desde su portal: una solicitud formal o un derecho
de petición para que le den una cita de una especialidad en la fecha que
pide. El personal la revisa (revisión clínica) y decide: aprobarla
asignando la cita, enviarla a la EPS y registrar su respuesta, o no
aprobarla.
"""

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.cita import CanalContacto


def _enum(clase, nombre: str):
    return SAEnum(clase, name=nombre, values_callable=lambda x: [e.value for e in x])


class TipoSolicitud(str, enum.Enum):
    FORMAL = "formal"  # solicitud formal
    DERECHO_PETICION = "derecho_peticion"


class TipoCita(str, enum.Enum):  # HU-76, criterio 2
    PRIMERA_VEZ = "primera_vez"
    CONTROL = "control"


class EstadoSolicitudCita(str, enum.Enum):  # HU-77
    PENDIENTE = "pendiente"  # de revisión
    PENDIENTE_EPS = "pendiente_eps"  # esperando la respuesta de la EPS
    APROBADA = "aprobada"  # con la cita asignada
    NEGADA = "negada"


class SolicitudCita(Base):
    __tablename__ = "solicitudes_cita"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    numero_radicado: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    tipo: Mapped[TipoSolicitud] = mapped_column(_enum(TipoSolicitud, "tipo_solicitud"), nullable=False)
    especialidad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("especialidades.id"), nullable=False
    )
    tipo_cita: Mapped[TipoCita] = mapped_column(_enum(TipoCita, "tipo_cita"), nullable=False)
    fecha_deseada: Mapped[date] = mapped_column(Date, nullable=False)  # HU-76, criterio 4
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    canal: Mapped[CanalContacto] = mapped_column(_enum(CanalContacto, "canal_contacto"), nullable=False)
    estado: Mapped[EstadoSolicitudCita] = mapped_column(
        _enum(EstadoSolicitudCita, "estado_solicitud_cita"),
        default=EstadoSolicitudCita.PENDIENTE,
        nullable=False,
        index=True,
    )
    radicada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    # --- Revisión clínica ---
    # Primera decisión (aprobar, negar o enviar a la EPS): mide el tiempo de revisión (HU-47).
    revisada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revisor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("personal.id"), nullable=True
    )
    prioritaria: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    respuesta: Mapped[str | None] = mapped_column(Text, nullable=True)  # lo que se le explica al paciente
    enviada_eps_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    respuesta_eps_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cita_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("citas.id"), nullable=True)

    paciente: Mapped["Paciente"] = relationship()
    especialidad: Mapped["Especialidad"] = relationship()
    revisor: Mapped["Personal | None"] = relationship()
    cita: Mapped["Cita | None"] = relationship()
