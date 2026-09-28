"""
Endpoints del asistente conversacional con IA — HU-33.

Requieren JWT: el asistente solo conversa con pacientes autenticados
(Bloque 3 — "disponible ya autenticado"), y la identidad del paciente
sale del token, nunca de lo que se escriba en el chat.

POST   /chat  -> enviar un mensaje y recibir la respuesta
GET    /chat  -> conversación actual (para redibujarla si se recarga la página)
DELETE /chat  -> empezar una conversación nueva
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_paciente
from app.models.paciente import Paciente
from app.schemas.chat import ChatRequest, ChatResponse, CitaChatOut, MensajeHistorialOut
from app.services import chatbot
from app.services.exceptions import AsistenteNoDisponibleError, ConversacionOcupadaError

router = APIRouter(tags=["Asistente IA"])


@router.post("/chat", response_model=ChatResponse)
def conversar(
    datos: ChatRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        resultado = chatbot.responder(db, paciente, datos.mensaje)
    except ConversacionOcupadaError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except AsistenteNoDisponibleError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    if resultado.urgencia:
        return ChatResponse(respuesta=resultado.texto, tipo="urgencia")
    if resultado.eventos:
        # Una sola acción de escritura por mensaje (ver chatbot.py): el
        # último evento es el resultado de este mensaje.
        tipo, cita = resultado.eventos[-1]
        return ChatResponse(
            respuesta=resultado.texto, tipo=tipo, cita=CitaChatOut.model_validate(cita)
        )
    return ChatResponse(respuesta=resultado.texto, tipo="mensaje")


@router.get("/chat", response_model=list[MensajeHistorialOut])
def obtener_conversacion(paciente: Paciente = Depends(get_current_paciente)):
    return chatbot.historial_visible(paciente.id)


@router.delete("/chat", status_code=status.HTTP_204_NO_CONTENT)
def reiniciar_conversacion(paciente: Paciente = Depends(get_current_paciente)):
    chatbot.reiniciar(paciente.id)
