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
    eps_id: uuid.UUID  # la EPS de cuyos afiliados es médico
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
    eps_id: uuid.UUID
    eps: str
    eps_corto: str
    registro_medico: str | None
    activo: bool
    origen: str  # "semilla", "ips" o "manual"
    creado_en: datetime
    sedes: list[str]
    turnos: list[TurnoOut]
    cupos_libres: int  # horarios futuros sin ocupar
    citas_proximas: int  # citas vigentes de hoy en adelante


class SedeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    nombre: str = Field(min_length=3, max_length=100)
    ciudad: str = Field(min_length=2, max_length=80)
    direccion: str | None = Field(default=None, max_length=150)


class EstadoSedeRequest(BaseModel):
    activa: bool


class SedeAdminOut(BaseModel):
    id: uuid.UUID
    nombre: str
    ciudad: str
    direccion: str | None
    activa: bool
    especialistas: list[str]  # activos con turnos en esta sede
    citas_proximas: int


class FarmaciaRequest(BaseModel):
    """Farmacia donde se reclaman las fórmulas (farmacias_service)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    nombre: str = Field(min_length=3, max_length=100)
    barrio: str = Field(min_length=2, max_length=100)
    ciudad: str = Field(min_length=2, max_length=80)
    direccion: str | None = Field(default=None, max_length=150)
    aliada: bool  # entrega gratis con el código de la fórmula
    sede_id: uuid.UUID  # la sede que tiene cerca
    distancia_km: float = Field(gt=0, le=50)


class EstadoFarmaciaRequest(BaseModel):
    activa: bool


class FarmaciaAdminOut(BaseModel):
    id: uuid.UUID
    nombre: str
    barrio: str
    ciudad: str
    direccion: str | None
    aliada: bool
    activa: bool
    sede_id: uuid.UUID | None
    sede: str | None
    distancia_km: float


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
