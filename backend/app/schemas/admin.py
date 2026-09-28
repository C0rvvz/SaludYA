"""Esquemas del apartado de administración (personal de la EPS / IPS)."""

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.personal import RolPersonal
from app.schemas.cita import EstadoVisible, EventoCitaOut

# --- Cuentas del personal ---


class LoginPersonalRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # Sin validar el formato: al iniciar sesión solo se busca la cuenta
    # (el formato se valida al crearla).
    correo: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=1, max_length=200)


class PersonalOut(BaseModel):
    id: uuid.UUID
    nombre: str
    correo: str
    rol: RolPersonal
    rol_texto: str
    activo: bool
    # El frontend solo los usa para mostrar u ocultar opciones; cada
    # endpoint vuelve a verificar el permiso.
    permisos: list[str]
    creado_en: datetime
    ultimo_acceso_en: datetime | None


class LoginPersonalResponse(BaseModel):
    access_token: str
    expira_en_minutos: int
    personal: PersonalOut


class CrearPersonalRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    nombre: str = Field(min_length=1, max_length=150)
    correo: EmailStr
    rol: RolPersonal
    password: str = Field(min_length=10, max_length=200)


class ActualizarPersonalRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    rol: RolPersonal | None = None
    activo: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=200)


# --- Gestión de citas (HU-34 a HU-43) ---


class PacienteResumenOut(BaseModel):
    id: uuid.UUID
    nombre: str
    tipo_documento: str
    numero_documento: str
    telefono_whatsapp: str


class RiesgoOut(BaseModel):
    """Nivel estimado de inasistencia: recomendación de acompañamiento, nunca para negar la atención."""

    porcentaje: int
    nivel: Literal["bajo", "medio", "alto"]
    factores: list[str]


class AccionesCitaOut(BaseModel):
    """Qué puede hacer ESTE usuario con ESTA cita (según su estado y el rol)."""

    confirmar: bool
    reprogramar: bool
    cancelar: bool
    recordatorio: bool
    contactar: bool
    registrar_resultado: bool
    observar: bool


class CitaAdminOut(BaseModel):
    id: uuid.UUID
    numero_comprobante: str | None
    paciente: PacienteResumenOut
    especialidad_id: uuid.UUID
    especialidad: str
    especialista: str
    sede: str
    ciudad: str
    modalidad: str
    fecha: date
    hora: time
    estado_visible: EstadoVisible
    estado_texto: str
    canal_recordatorio: str
    recordatorio_enviado_en: datetime | None
    riesgo: RiesgoOut | None
    acciones: AccionesCitaOut


class CitaHistorialOut(BaseModel):
    id: uuid.UUID
    numero_comprobante: str | None
    especialidad: str
    fecha: date
    hora: time
    estado_visible: EstadoVisible
    estado_texto: str


class ResumenAsistenciaOut(BaseModel):
    atendidas: int
    no_asistio: int
    canceladas: int
    reprogramadas: int


class RegistroAuditoriaOut(BaseModel):
    id: uuid.UUID
    fecha: datetime
    actor_tipo: str
    actor_nombre: str
    accion: str
    descripcion: str
    detalle: str | None
    cita_id: uuid.UUID | None
    numero_comprobante: str | None
    paciente_nombre: str | None
    estado_anterior: str | None
    estado_nuevo: str | None


class ObservacionOut(BaseModel):
    id: uuid.UUID
    texto: str
    autor: str
    numero_comprobante: str | None
    creado_en: datetime


class PacienteDetalleOut(PacienteResumenOut):
    correo: str | None
    eps: str | None
    estado_afiliacion: str


class CitaAdminDetalleOut(CitaAdminOut):
    paciente: PacienteDetalleOut
    motivo_cancelacion: str | None
    historial_estado: list[EventoCitaOut]  # HU-18 / HU-43
    historial_asistencia: list[CitaHistorialOut]  # HU-35 criterio 1
    resumen_asistencia: ResumenAsistenciaOut  # HU-35 criterio 3
    recordatorios: list[RegistroAuditoriaOut]  # HU-35 criterio 2
    contactos: list[RegistroAuditoriaOut]  # HU-37 criterio 4
    observaciones: list[ObservacionOut]  # HU-41
    auditoria: list[RegistroAuditoriaOut]  # HU-43 criterio 4


class ContactoRequest(BaseModel):
    """HU-37: resultado de la llamada al paciente."""

    model_config = ConfigDict(str_strip_whitespace=True)

    resultado: Literal["contesto", "no_contesto", "numero_equivocado", "buzon_de_voz"]
    nota: str | None = Field(default=None, max_length=500)


class ResultadoAtencionRequest(BaseModel):
    resultado: Literal["atendida", "no_asistio"]


class ObservacionRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    texto: str = Field(min_length=1, max_length=2000)
    cita_id: uuid.UUID | None = None
