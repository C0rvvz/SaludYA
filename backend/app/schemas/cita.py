"""Esquemas de entrada/salida de citas — HU-16, HU-17 y Bloque 5 (HU-18, HU-20, HU-21, HU-26, HU-27, HU-29)."""

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.cita import CanalContacto
from app.schemas.especialista import EspecialistaBasicoOut
from app.schemas.sede import SedeOut

EstadoVisible = Literal[
    "pendiente_confirmar", "asistencia_confirmada", "finalizada", "cancelada", "reprogramada"
]


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
    numero_comprobante: str
    comprobante_generado_en: datetime
    mensaje: str


class EventoCitaOut(BaseModel):
    """Un paso en la línea de tiempo del estado de la cita (HU-18)."""

    tipo: str
    fecha: datetime
    descripcion: str


class MiCitaOut(BaseModel):
    """Una cita tal como la ve el paciente en "Mis citas" (HU-26/HU-27/HU-29/HU-18)."""

    id: uuid.UUID
    numero_comprobante: str | None
    especialista: EspecialistaBasicoOut
    sede: SedeOut
    modalidad: str
    fecha: date
    hora: time
    canal_recordatorio: str
    estado: str
    # Estado como lo entiende el paciente, y su texto (HU-18, criterio 4).
    estado_visible: EstadoVisible
    estado_texto: str
    creado_en: datetime
    asistencia_confirmada_en: datetime | None
    cancelada_en: datetime | None
    motivo_cancelacion: str | None
    recordatorio_enviado_en: datetime | None
    reprogramada_desde: str | None  # número de comprobante de la cita original
    reprogramada_a: str | None  # número de comprobante de la cita nueva
    # Qué puede hacer el paciente con esta cita ahora (HU-27, criterio 4).
    puede_confirmar_asistencia: bool
    puede_cancelar: bool
    puede_reprogramar: bool
    historial: list[EventoCitaOut]


class CancelarCitaRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # HU-21, criterio 3: el motivo es opcional ("cuando corresponda").
    motivo: str | None = Field(default=None, max_length=300)


class ReprogramarCitaRequest(BaseModel):
    disponibilidad_id: uuid.UUID


class ComprobanteOut(BaseModel):
    """
    Los 9 campos mínimos definidos para el comprobante: identificador,
    nombre del paciente, especialidad, profesional, sede, modalidad,
    fecha, hora y estado -- más el canal y fecha de envío.
    """

    numero_comprobante: str
    paciente_nombre: str
    especialidad: str
    profesional: str
    sede: str
    modalidad: str
    fecha: date
    hora: time
    estado: str
    canal_envio: str
    generado_en: datetime
