"""
Sesión iniciada (paciente o personal) — RNF-17 (HU-91, sesión única) y
RNF-24 (HU-93, cierre a los 2 minutos de inactividad).

El JWT por sí solo no se puede "cerrar": vale hasta que vence. Por eso
cada token lleva el id de su sesión ("sid") y cada petición se comprueba
contra esta tabla: si la sesión se cerró (por otra sesión nueva, por
inactividad, porque la persona salió o porque se desactivó la cuenta),
el token deja de servir aunque no haya vencido.

También es el registro de accesos: desde qué IP y dispositivo, cuándo
empezó, su última actividad y por qué se cerró.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MotivoCierre(str, enum.Enum):
    SALIO = "salio"  # la persona cerró su sesión
    OTRA_SESION = "otra_sesion"  # inició sesión en otra pestaña o dispositivo
    INACTIVIDAD = "inactividad"
    CUENTA_MODIFICADA = "cuenta_modificada"  # desactivada, o le cambiaron el rol o la contraseña
    CERRADA_POR_ADMIN = "cerrada_admin"  # un administrador la cerró desde "Seguridad"


class Sesion(Base):
    __tablename__ = "sesiones"
    __table_args__ = (
        # Las sesiones abiertas de una persona: se buscan en cada inicio de sesión.
        Index("ix_sesiones_abiertas", "tipo", "sujeto_id", postgresql_where="cerrada_en IS NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)  # "paciente" o "personal"
    sujeto_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    creada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    ultima_actividad_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    cerrada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_cierre: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)  # cabe una IPv6
    dispositivo: Mapped[str | None] = mapped_column(String(200), nullable=True)  # navegador (User-Agent)
