"""Esquemas del Dashboard y los Reportes del personal (ver services/reportes_service.py)."""

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel


class HoyOut(BaseModel):
    """HU-44: citas y horarios del día."""

    fecha: date
    programadas: int
    confirmadas: int
    pendientes: int
    canceladas: int
    horarios_liberados: int
    horarios_reasignados: int


class UsoCanalOut(BaseModel):
    canal: str
    cantidad: int


class DemandaOut(BaseModel):
    nombre: str
    cantidad: int


class InasistenciaEspecialidadOut(BaseModel):
    especialidad: str
    atendidas: int
    no_asistio: int
    porcentaje: float | None


class InasistenciaPacienteOut(BaseModel):
    paciente_id: uuid.UUID
    nombre: str
    numero_documento: str
    no_asistio: int
    citas: int
    cita_id: uuid.UUID  # la última inasistencia, para abrir su detalle e historial


class TramoTendenciaOut(BaseModel):
    etiqueta: str
    desde: date
    hasta: date
    atendidas: int
    no_asistio: int
    porcentaje: float | None


class ReporteOut(BaseModel):
    periodo: Literal["mes", "trimestre", "anio"]
    periodo_texto: str
    desde: date
    hasta: date
    hoy: HoyOut
    citas: int
    confirmadas: int
    sin_confirmar: int
    porcentaje_confirmadas: float | None
    canceladas: int
    canceladas_a_tiempo: int
    atendidas: int
    no_asistio: int
    porcentaje_inasistencia: float | None
    cupos_liberados: int
    cupos_reasignados: int
    minutos_promedio_reasignacion: int | None
    canales: list[UsoCanalOut]
    demanda: list[DemandaOut]
    inasistencia_por_especialidad: list[InasistenciaEspecialidadOut]
    inasistencia_por_paciente: list[InasistenciaPacienteOut]
    tendencia: list[TramoTendenciaOut]
    tendencia_direccion: Literal["aumenta", "disminuye", "se_mantiene"] | None
