"""Esquemas del panel "Seguridad" del administrador (ver services/seguridad_service.py)."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class IndicadoresSeguridadOut(BaseModel):
    ingresos_exitosos: int
    ingresos_fallidos: int
    bloqueos: int
    accesos_denegados: int  # sin permiso o con un token inválido
    sesiones_activas: int
    alertas_altas: int


class AlertaSeguridadOut(BaseModel):
    clave: str
    severidad: str  # "alta", "media" o "info"
    titulo: str
    descripcion: str
    recomendacion: str
    cantidad: int
    ultima_vez: datetime
    ip: str | None
    sujeto: str | None


class SesionActivaOut(BaseModel):
    id: uuid.UUID
    tipo: str  # "personal" o "paciente"
    nombre: str
    identificador: str | None  # correo, o documento enmascarado
    ip: str | None
    dispositivo: str | None
    creada_en: datetime
    ultima_actividad_en: datetime


class EventoSeguridadOut(BaseModel):
    id: uuid.UUID
    fecha: datetime
    tipo: str
    tipo_texto: str
    severidad: str
    ambito: str
    sujeto_nombre: str | None
    identificador: str | None
    ip: str | None
    dispositivo: str | None
    descripcion: str
    detalle: str | None


class ControlSeguridadOut(BaseModel):
    nombre: str
    detalle: str


class PanelSeguridadOut(BaseModel):
    desde: datetime
    hasta: datetime
    indicadores: IndicadoresSeguridadOut
    alertas: list[AlertaSeguridadOut]
    sesiones_activas: list[SesionActivaOut]
    eventos: list[EventoSeguridadOut]
    controles: list[ControlSeguridadOut]
