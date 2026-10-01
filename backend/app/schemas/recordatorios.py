"""Esquemas del Centro de recordatorios (ver services/centro_recordatorios_service.py)."""

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.cita import CanalContacto
from app.models.recordatorio_programado import EstadoProgramacion

ClavePlantilla = Literal["recordatorio_estandar", "confirmacion_urgente", "cupo_liberado"]


class CitaActivaOut(BaseModel):
    id: uuid.UUID
    fecha: date
    hora: time
    especialidad: str
    numero_comprobante: str | None


class PacienteRecordatoriosOut(BaseModel):
    """HU-63: nombre, canal preferido, último envío y su estado."""

    paciente_id: uuid.UUID
    nombre: str
    numero_documento: str
    telefono_whatsapp: str
    canal_preferido: CanalContacto | None
    ultimo_envio_en: datetime | None
    ultimo_envio: str | None
    estado: Literal["enviado", "fallido", "respondido"] | None
    proximo_programado_en: datetime | None
    citas_activas: list[CitaActivaOut]


class PlantillaOut(BaseModel):
    clave: ClavePlantilla
    nombre: str
    texto: str | None  # None: la plantilla necesita que se elija una cita


class EditarRecordatorioRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    cita_id: uuid.UUID | None = None
    canal: CanalContacto  # la llamada programada es la HU-65
    plantilla: ClavePlantilla | None = None
    texto: str = Field(min_length=1, max_length=1000)
    programado_para: datetime  # sin zona = hora de Colombia


class ProgramarRecordatorioRequest(EditarRecordatorioRequest):
    paciente_id: uuid.UUID


class RecordatorioProgramadoOut(BaseModel):
    id: uuid.UUID
    paciente_id: uuid.UUID
    paciente_nombre: str
    cita_id: uuid.UUID | None
    canal: CanalContacto
    plantilla: str | None
    texto: str
    programado_para: datetime
    estado: EstadoProgramacion
    intentos: int
    enviado_en: datetime | None
    programado_por: str
