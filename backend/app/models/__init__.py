"""
Modelos de SQLAlchemy del Sprint 1.

Este archivo existe para que, al importar `app.models`, todos los
modelos queden registrados en Base.metadata — tanto Alembic
(autogenerate) como `Base.metadata.create_all()` dependen de esto.
"""

from app.models.eps import Eps
from app.models.paciente import Paciente
from app.models.codigo_otp import CodigoOTP
from app.models.especialidad import Especialidad
from app.models.sede import Sede
from app.models.especialista import Especialista, especialista_sedes, especialista_modalidades
from app.models.disponibilidad import Disponibilidad
from app.models.cita import Cita

__all__ = [
    "Eps",
    "Paciente",
    "CodigoOTP",
    "Especialidad",
    "Sede",
    "Especialista",
    "especialista_sedes",
    "especialista_modalidades",
    "Disponibilidad",
    "Cita",
]
