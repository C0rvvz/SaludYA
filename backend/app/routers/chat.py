"""
Endpoint del asistente conversacional con IA — HU-33.

Requiere JWT: el asistente solo conversa con pacientes autenticados
(Bloque 3 — "disponible ya autenticado"), y la identidad del paciente
sale del token, nunca de lo que se escriba en el chat.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_paciente
from app.models.paciente import Paciente
from app.schemas.chat import ChatRequest, ChatResponse
from app.services import ia
from app.services.exceptions import AsistenteNoDisponibleError

router = APIRouter(tags=["Asistente IA"])


@router.post("/chat", response_model=ChatResponse)
def conversar(
    datos: ChatRequest,
    paciente: Paciente = Depends(get_current_paciente),
):
    mensajes = [
        {"role": "system", "content": ia.instrucciones_sistema(paciente.nombre)},
        {"role": "user", "content": datos.mensaje},
    ]

    try:
        respuesta = ia.completar(mensajes, usar_tools=False)
    except AsistenteNoDisponibleError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    return ChatResponse(respuesta=respuesta.content or "")
