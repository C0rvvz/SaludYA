"""Esquemas de "Especialistas" en el panel del personal y de la IPS simulada."""

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.especialista import Modalidad


class TurnoIn(BaseModel):
    """Un bloque del horario semanal."""

    dia_semana: int = Field(ge=0, le=5)  # 0 = lunes ... 5 = sábado
    sede_id: uuid.UUID
    modalidad: Modalidad
    hora_inicio: time
    hora_fin: time
    duracion_minutos: int


class CrearEspecialistaRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    tratamiento: Literal["Dr.", "Dra."]
    nombre: str = Field(min_length=3, max_length=120)
    especialidad_id: uuid.UUID
    registro_medico: str | None = Field(default=None, max_length=20)
    turnos: list[TurnoIn] = Field(min_length=1, max_length=20)


class HorarioRequest(BaseModel):
    turnos: list[TurnoIn] = Field(min_length=1, max_length=20)


class EstadoEspecialistaRequest(BaseModel):
    activo: bool


class TurnoOut(TurnoIn):
    sede: str


class EspecialistaAdminOut(BaseModel):
    id: uuid.UUID
    nombre: str
    especialidad_id: uuid.UUID
    especialidad: str
    registro_medico: str | None
    activo: bool
    origen: str  # "semilla", "ips" o "manual"
    creado_en: datetime
    sedes: list[str]
    turnos: list[TurnoOut]
    cupos_libres: int  # horarios futuros sin ocupar
    citas_proximas: int  # citas vigentes de hoy en adelante


class SincronizacionIpsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    fecha: datetime
    origen: str  # "automatica", "manual" o "inicial"
    solicitada_por: str | None
    especialistas_nuevos: int
    especialistas_retirados: int
    franjas_creadas: int
    desde: date | None
    hasta: date | None
    detalle: str | None


class EspecialistasAdminOut(BaseModel):
    especialistas: list[EspecialistaAdminOut]
    sincronizaciones: list[SincronizacionIpsOut]  # las últimas, de la más reciente a la más antigua
    proxima_automatica: datetime
    dias_entre_actualizaciones: int
