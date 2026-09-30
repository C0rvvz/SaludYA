"""Esquemas de las solicitudes de cita (cartas de petición) y la revisión clínica."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field

from app.models.cita import CanalContacto
from app.models.solicitud_cita import EstadoSolicitudCita, TipoCita, TipoSolicitud
from app.schemas.admin import CitaHistorialOut, ObservacionOut, PacienteDetalleOut, ResumenAsistenciaOut


class RadicarSolicitudRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    tipo: TipoSolicitud
    especialidad_id: uuid.UUID
    tipo_cita: TipoCita
    fecha_deseada: date
    motivo: str = Field(min_length=10, max_length=2000)
    canal: CanalContacto


class CitaAprobadaOut(BaseModel):
    id: uuid.UUID
    numero_comprobante: str | None
    especialista: str
    sede: str
    fecha: date
    hora: time
    estado: str


class SolicitudCitaOut(BaseModel):
    """Lo que ve el paciente (y la base de lo que ve el personal)."""

    id: uuid.UUID
    numero_radicado: str
    tipo: TipoSolicitud
    especialidad_id: uuid.UUID
    especialidad: str  # HU-76, criterio 3
    tipo_cita: TipoCita  # HU-76, criterio 2
    fecha_deseada: date  # HU-76, criterio 4
    motivo: str
    canal: CanalContacto
    estado: EstadoSolicitudCita  # HU-77
    radicada_en: datetime
    respuesta: str | None
    cita: CitaAprobadaOut | None


class SolicitudCitaAdminOut(SolicitudCitaOut):
    paciente_id: uuid.UUID
    paciente_nombre: str  # HU-76, criterio 1
    revisada_en: datetime | None
    revisor: str | None
    prioritaria: bool
    enviada_eps_en: datetime | None
    respuesta_eps_en: datetime | None


class RevisionClinicaOut(BaseModel):
    """HU-78 / HU-79: el contexto de la solicitud y del paciente para revisarla."""

    solicitud: SolicitudCitaAdminOut
    paciente: PacienteDetalleOut
    historial: list[CitaHistorialOut]
    resumen_asistencia: ResumenAsistenciaOut
    observaciones: list[ObservacionOut]
    en_lista_espera: list[str]  # especialidades en las que espera cupo


class AprobarSolicitudRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    disponibilidad_id: uuid.UUID
    prioritaria: bool = False
    respuesta: str | None = Field(default=None, max_length=1000)


class EnviarEpsRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    respuesta: str | None = Field(default=None, max_length=1000)


class NegarSolicitudRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    respuesta: str = Field(min_length=5, max_length=1000)  # el paciente debe saber por qué


class IndicadoresSolicitudesOut(BaseModel):
    """HU-46 (solicitudes) y HU-47 (revisiones) del periodo."""

    recibidas: int
    pendientes_revision: int
    prioritarias_aprobadas: int
    formales: int
    derechos_peticion: int
    minutos_promedio_revision: int | None
    citas_asignadas: int
    pendientes_eps: int
