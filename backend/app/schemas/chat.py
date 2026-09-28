"""Esquemas de entrada/salida del asistente conversacional — HU-33."""

from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    # Límite de longitud: evita mensajes enormes que disparen el costo
    # de cada llamada al modelo.
    mensaje: str = Field(min_length=1, max_length=1000)


class CitaChatOut(BaseModel):
    """La cita sobre la que se acaba de actuar, para mostrarla como
    tarjeta dentro del chat (HU-33, criterio 4: el resultado se entrega
    en el mismo chat)."""

    numero_comprobante: str
    especialidad: str
    profesional: str
    sede: str
    ciudad: str
    modalidad: str
    fecha: date
    hora: time
    recordatorio_por: str
    estado: str


class ChatResponse(BaseModel):
    respuesta: str
    # "urgencia": mensaje fijo de redirección a urgencias (la IA no
    # intervino); el frontend lo muestra destacado. Los demás tipos
    # distintos de "mensaje" traen la cita afectada en `cita`.
    tipo: Literal[
        "mensaje",
        "urgencia",
        "cita_agendada",
        "cita_cancelada",
        "cita_reprogramada",
        "asistencia_confirmada",
        "llegada_registrada",
    ]
    cita: CitaChatOut | None = None


class MensajeHistorialOut(BaseModel):
    rol: Literal["paciente", "asistente"]
    texto: str
