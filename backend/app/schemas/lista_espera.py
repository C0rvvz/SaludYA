"""Esquemas de la lista de espera del paciente (ver services/lista_espera_service.py)."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field

from app.models.cita import CanalContacto
from app.models.especialista import Modalidad
from app.models.lista_espera import EstadoSolicitud, Jornada


class UnirseListaEsperaRequest(BaseModel):
    especialidad_id: uuid.UUID
    sede_ids: list[uuid.UUID] = Field(min_length=1)  # HU-55: al menos una sede
    jornada: Jornada = Jornada.CUALQUIERA
    modalidad: Modalidad | None = None  # None = cualquiera
    canal: CanalContacto


class OfertaOut(BaseModel):
    """HU-31, criterio 4: la información básica de la cita ofrecida."""

    especialista: str
    sede: str
    modalidad: Modalidad
    fecha: date
    hora: time
    expira_en: datetime


class CitaAsignadaOut(BaseModel):
    id: uuid.UUID
    numero_comprobante: str | None
    especialista: str
    sede: str
    fecha: date
    hora: time


class SolicitudEsperaOut(BaseModel):
    id: uuid.UUID
    especialidad: str
    sedes: list[str]
    jornada: Jornada
    modalidad: Modalidad | None
    canal: CanalContacto
    estado: EstadoSolicitud
    creado_en: datetime
    posicion: int | None  # HU-19; None si ya salió de la fila
    total_en_lista: int
    oferta: OfertaOut | None
    cita: CitaAsignadaOut | None
