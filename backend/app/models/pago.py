"""
Pago en línea de una cita atendida (el copago o la consulta particular):
así el paciente no hace fila en la sede para pagar.

Cada intento es un Pago, con su referencia (PAG-2026-08812), el medio
(PSE o tarjeta) y su estado: pendiente (esperando al banco), aprobado o
rechazado. De la tarjeta solo se guarda la marca y los 4 últimos números
("VISA •••• 4242"): nunca el número completo ni el CVC.

Aprobado, lleva un código de llegada de 4 números (y su QR) para la
máquina de la EPS. Lo procesa la pasarela (integrations/pasarela_pagos).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

PENDIENTE, APROBADO, RECHAZADO = "pendiente", "aprobado", "rechazado"


class Pago(Base):
    __tablename__ = "pagos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cita_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("citas.id"), nullable=False, index=True)
    referencia: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    metodo: Mapped[str] = mapped_column(String(10), nullable=False)  # "pse" o "tarjeta"
    estado: Mapped[str] = mapped_column(String(12), default=PENDIENTE, nullable=False)
    valor: Mapped[int] = mapped_column(Integer, nullable=False)  # pesos
    detalle: Mapped[str] = mapped_column(String(80), nullable=False)  # "PSE · Bancolombia" o "VISA •••• 4242 · 1 cuota"
    motivo: Mapped[str | None] = mapped_column(String(150), nullable=True)  # por qué no se aprobó
    transaccion: Mapped[str] = mapped_column(String(40), nullable=False)  # id en la pasarela
    codigo_llegada: Mapped[str | None] = mapped_column(String(4), nullable=True)  # solo si se aprobó
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    cita: Mapped["Cita"] = relationship(back_populates="pagos")
