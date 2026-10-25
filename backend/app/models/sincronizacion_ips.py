"""
Actualización de la IPS (simulada) — RNF "el aplicativo mantendrá
actualizada la base de datos de los especialistas".

Cada 10 días la IPS manda su lista de especialistas y sus agendas: llegan
especialistas nuevos, alguno deja de atender en la red y se generan los
horarios de los próximos días. Aquí queda cada actualización: cuándo,
quién la pidió (o si fue la automática) y qué cambió.
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SincronizacionIps(Base):
    __tablename__ = "sincronizaciones_ips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    origen: Mapped[str] = mapped_column(String(12), nullable=False)  # "automatica", "manual" o "inicial"
    solicitada_por: Mapped[str | None] = mapped_column(String(150), nullable=True)  # nombre (rol) del personal
    especialistas_nuevos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    especialistas_retirados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    franjas_creadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    desde: Mapped[date | None] = mapped_column(Date, nullable=True)
    hasta: Mapped[date | None] = mapped_column(Date, nullable=True)
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)  # quiénes llegaron y quiénes se fueron
