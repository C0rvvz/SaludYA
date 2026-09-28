"""Esquemas de entrada/salida del asistente conversacional — HU-33."""

from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # Límite de longitud: evita mensajes enormes que disparen el costo
    # de cada llamada al modelo.
    mensaje: str = Field(min_length=1, max_length=1000)


class CitaAgendadaOut(BaseModel):
    """La cita recién creada, para mostrarla como tarjeta dentro del chat
    (HU-33, criterio 4: el resultado se entrega en el mismo chat)."""

    numero_comprobante: str
    especialidad: str
    profesional: str
    sede: str
    ciudad: str
    modalidad: str
    fecha: date
    hora: time
    recordatorio_por: str


class ChatResponse(BaseModel):
    respuesta: str
    # "urgencia": mensaje fijo de redirección a urgencias (la IA no
    # intervino); el frontend lo muestra destacado.
    tipo: Literal["mensaje", "cita_agendada", "urgencia"]
    cita: CitaAgendadaOut | None = None


class MensajeHistorialOut(BaseModel):
    rol: Literal["paciente", "asistente"]
    texto: str
