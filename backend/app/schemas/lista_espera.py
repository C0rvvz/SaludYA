"""Esquemas de la lista de espera, del paciente y del personal (ver services/lista_espera_service.py)."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field

from app.models.cita import CanalContacto
from app.models.especialista import Modalidad
from app.models.lista_espera import EstadoSolicitud, Jornada, PrioridadMedica


class UnirseListaEsperaRequest(BaseModel):
    especialidad_id: uuid.UUID
    sede_ids: list[uuid.UUID] = Field(min_length=1)  # HU-55: al menos una sede
    jornada: Jornada = Jornada.CUALQUIERA
    modalidad: Modalidad | None = None  # sin valor: cualquier modalidad
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
    estado: str  # HU-58: estado actual de la cita asignada


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


# --- Personal: Fase D (HU-45, HU-53 a HU-61) ---


class SolicitudEsperaAdminOut(SolicitudEsperaOut):
    especialidad_id: uuid.UUID
    paciente_id: uuid.UUID
    paciente_nombre: str  # HU-54
    numero_documento: str
    telefono_whatsapp: str
    prioridad: PrioridadMedica  # HU-56
    cerrada_en: datetime | None
    minutos_espera: int  # HU-54: tiempo de espera


class ListaEsperaAdminOut(BaseModel):
    dia: date  # HU-45, criterio 3
    esperando_ahora: int
    solicitudes: list[SolicitudEsperaAdminOut]


class HorarioCompatibleOut(BaseModel):
    """HU-55 criterio 1: un horario que se ajusta a las preferencias del paciente."""

    id: uuid.UUID
    fecha: date
    hora: time
    especialista: str
    sede: str
    modalidad: Modalidad
    ofrecido: bool  # el que ya se le reservó por la lista


class PrioridadRequest(BaseModel):
    prioridad: PrioridadMedica


class ConfirmarDesdeListaRequest(BaseModel):
    disponibilidad_id: uuid.UUID


class CancelarDesdeListaRequest(BaseModel):
    motivo: str | None = Field(default=None, max_length=300)
