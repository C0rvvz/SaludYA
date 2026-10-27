"""
Fórmula médica de una cita atendida y farmacias donde reclamarla.

FormulaMedica: lo que escribió el médico (diagnóstico y nota), los
medicamentos (nombre, dosis, cada cuánto, duración y cantidad) y las
recomendaciones. Todo eso son datos médicos: se guardan cifrados
(RNF-23, core/cifrado.py). Los medicamentos y las recomendaciones van como
listas en JSON. El código (FM-2026-07733) es el que el paciente muestra
en una farmacia aliada, junto con su QR, hasta la fecha en que vence.

La registra el personal (coordinador médico o administrador) o llega de
la IPS (simulada); ver formulas_service.

Farmacia: dónde reclamar los medicamentos. En las aliadas se entregan
gratis con el código; las demás cobran. Cada una está cerca de una sede
(sede_id) a cierta distancia, para ordenarlas según dónde lo atendieron.
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.cifrado import TextoCifrado
from app.core.database import Base


class FormulaMedica(Base):
    __tablename__ = "formulas_medicas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cita_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citas.id"), unique=True, nullable=False
    )
    codigo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

    diagnostico: Mapped[str] = mapped_column(TextoCifrado("formulas_medicas.diagnostico"), nullable=False)
    nota: Mapped[str | None] = mapped_column(TextoCifrado("formulas_medicas.nota"), nullable=True)
    medicamentos: Mapped[str] = mapped_column(TextoCifrado("formulas_medicas.medicamentos"), nullable=False)
    recomendaciones: Mapped[str] = mapped_column(TextoCifrado("formulas_medicas.recomendaciones"), nullable=False)
    cubierta_por_eps: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    registrada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    registrada_por: Mapped[str] = mapped_column(String(150), nullable=False)  # quién la registró (o "IPS")
    vence_en: Mapped[date] = mapped_column(Date, nullable=False)

    cita: Mapped["Cita"] = relationship(back_populates="formula")


class Farmacia(Base):
    __tablename__ = "farmacias"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    barrio: Mapped[str] = mapped_column(String(100), nullable=False)
    ciudad: Mapped[str] = mapped_column(String(80), nullable=False)
    direccion: Mapped[str | None] = mapped_column(String(150), nullable=True)
    aliada: Mapped[bool] = mapped_column(Boolean, nullable=False)  # entrega gratis con el código
    activa: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    sede_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sedes.id"), nullable=True)
    distancia_km: Mapped[float] = mapped_column(Float, nullable=False)  # desde esa sede

    sede: Mapped["Sede | None"] = relationship()
