"""Esquemas de entrada/salida de la confirmación de cita — HU-16."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict

from app.models.cita import CanalContacto
from app.schemas.especialista import EspecialistaBasicoOut
from app.schemas.sede import SedeOut


class ConfirmarCitaRequest(BaseModel):
    disponibilidad_id: uuid.UUID
    canal_recordatorio: CanalContacto


class CitaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    especialista: EspecialistaBasicoOut
    sede: SedeOut
    modalidad: str
    fecha: date
    hora: time
    canal_recordatorio: str
    estado: str
    creado_en: datetime
    mensaje: str
