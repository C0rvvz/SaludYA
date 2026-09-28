"""
Personal de la EPS / IPS que usa el apartado de administración
(HU-34 en adelante).

Las cuentas NO se registran solas: el primer administrador se crea con
el script app/scripts/crear_personal.py y los demás los crea un
administrador desde la pantalla "Usuarios". El rol viene de la cuenta
(nunca se elige al iniciar sesión) y define qué puede hacer cada uno
(ver app/core/permisos.py).
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RolPersonal(str, enum.Enum):
    ADMINISTRADOR = "administrador"
    AGENDAMIENTO = "agendamiento"
    CALL_CENTER = "call_center"
    COORDINADOR_MEDICO = "coordinador_medico"


class Personal(Base):
    __tablename__ = "personal"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    # Siempre en minúsculas: el correo es el usuario para iniciar sesión.
    correo: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    # Nunca la contraseña: solo su hash (ver app/core/security.py).
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[RolPersonal] = mapped_column(
        SAEnum(RolPersonal, name="rol_personal", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    # Desactivar en vez de borrar: la auditoría conserva quién hizo cada acción.
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    ultimo_acceso_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
