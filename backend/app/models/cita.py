"""
Cita — HU-16 (confirmar cita) y HU-17 (certificado/comprobante).

HU-16 y HU-17 son historias independientes (así lo definiste), pero
comparten la misma fila de datos: HU-16 la crea con estado CONFIRMADA,
HU-17 le agrega los campos propios del comprobante (número, canal de
envío, fecha de generación). No se duplica en una tabla aparte porque
todo lo demás que debe mostrar el comprobante (nombre del paciente,
especialidad, profesional, sede, modalidad, fecha, hora) ya se puede
obtener por JOIN a través de disponibilidad -> especialista y de
paciente, sin repetir datos.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Enum as SAEnum, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EstadoCita(str, enum.Enum):
    # Agendada y vigente. Que el paciente haya confirmado su ASISTENCIA
    # (HU-29/HU-23) no es otro estado: es asistencia_confirmada_en.
    CONFIRMADA = "confirmada"
    CANCELADA = "cancelada"  # HU-21
    # HU-20: fue reemplazada por otra cita (la nueva apunta a esta con
    # reprogramada_desde_id).
    REPROGRAMADA = "reprogramada"
    # HU-25: resultado de la cita, registrado después de la consulta.
    ATENDIDA = "atendida"
    NO_ASISTIO = "no_asistio"


class CanalContacto(str, enum.Enum):
    WHATSAPP = "whatsapp"
    SMS = "sms"
    CORREO = "correo"
    LLAMADA = "llamada"


class Cita(Base):
    __tablename__ = "citas"
    __table_args__ = (
        # Una sola cita ACTIVA por franja. Las canceladas y reprogramadas
        # conservan su franja como historial, pero ya no la bloquean.
        Index(
            "uq_citas_disponibilidad_activa",
            "disponibilidad_id",
            unique=True,
            postgresql_where=text("estado = 'confirmada'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    paciente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pacientes.id"), nullable=False, index=True
    )
    disponibilidad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("disponibilidad.id"), nullable=False, index=True
    )

    # --- HU-16 ---
    canal_recordatorio: Mapped[CanalContacto] = mapped_column(
        SAEnum(CanalContacto, name="canal_contacto", values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    estado: Mapped[EstadoCita] = mapped_column(
        SAEnum(EstadoCita, name="estado_cita", values_callable=lambda x: [e.value for e in x]), default=EstadoCita.CONFIRMADA, nullable=False
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # --- HU-17: campos propios del comprobante ---
    numero_comprobante: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    canal_envio_comprobante: Mapped[CanalContacto | None] = mapped_column(
        SAEnum(CanalContacto, name="canal_contacto", values_callable=lambda x: [e.value for e in x]), nullable=True
    )
    comprobante_generado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- HU-29 / HU-23: el paciente confirmó que asistirá ---
    asistencia_confirmada_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- HU-21: cancelación ---
    cancelada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_cancelacion: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # --- HU-20: reprogramación ---
    # En la cita original: cuándo se reprogramó. En la nueva: de cuál viene.
    reprogramada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reprogramada_desde_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id", name="fk_citas_reprogramada_desde"), nullable=True
    )

    # --- HU-24: el paciente registró su llegada (check-in) ---
    llegada_registrada_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # --- HU-25: cuándo se registró el resultado (atendida / no asistió) ---
    cerrada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # --- HU-22: recordatorio ---
    recordatorio_enviado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    recordatorio_intentos: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )

    paciente: Mapped["Paciente"] = relationship(back_populates="citas")
    disponibilidad: Mapped["Disponibilidad"] = relationship(back_populates="citas")
    reprogramada_desde: Mapped["Cita | None"] = relationship(
        remote_side=[id], back_populates="reemplazada_por"
    )
    reemplazada_por: Mapped["Cita | None"] = relationship(back_populates="reprogramada_desde")
