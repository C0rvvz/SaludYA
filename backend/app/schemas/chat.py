"""Esquemas de entrada/salida del asistente conversacional — HU-33."""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    # Límite de longitud: evita mensajes enormes que disparen el costo
    # de cada llamada a OpenAI.
    mensaje: str = Field(min_length=1, max_length=1000)


class ChatResponse(BaseModel):
    respuesta: str
