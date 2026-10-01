"""
Asistente conversacional — HU-33: historial en memoria y ciclo completo
(mensaje del paciente -> chequeo de urgencia -> posibles tool_calls ->
ejecución validada -> respuesta final).

El historial vive en un diccionario en memoria, una conversación por
paciente (la clave es el id del paciente del JWT). Todavía NO se guarda
en PostgreSQL, así que:
- se pierde al reiniciar la API;
- solo es correcto con un único proceso de uvicorn (como el
  docker-compose actual): con varios workers cada uno tendría su
  propio diccionario.
"""

import json
import logging
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from openai.types.chat import ChatCompletionMessage
from sqlalchemy.orm import Session

from app.models.paciente import Paciente
from app.services import herramientas_ia, ia, urgencias
from app.services.exceptions import AsistenteNoDisponibleError, ConversacionOcupadaError

logger = logging.getLogger("saludya.chatbot")

# Sin actividad durante este tiempo, la conversación se olvida (libera
# memoria). Coincide con la vida típica de una sesión de paciente.
_EXPIRA_TRAS = timedelta(minutes=30)
# Tope del historial que se envía al modelo en cada llamada: acota el
# costo y el tiempo de respuesta en conversaciones largas.
_MAX_MENSAJES = 40
# Tope de llamadas al modelo por cada mensaje del paciente, para que un
# modelo que encadena funciones sin parar no deje la petición colgada.
_MAX_PASOS = 5
_RESPUESTA_SIN_CIERRE = (
    "Disculpe, no pude completar su solicitud. ¿Puede escribirla de nuevo con otras palabras?"
)


@dataclass
class _Conversacion:
    # Sin el mensaje de sistema: se regenera en cada turno para que la
    # fecha de "hoy" siempre sea la actual.
    mensajes: list[dict] = field(default_factory=list)
    estado: herramientas_ia.EstadoConversacion = field(
        default_factory=herramientas_ia.EstadoConversacion
    )
    ultima_actividad: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    ocupada: threading.Lock = field(default_factory=threading.Lock)


@dataclass
class RespuestaChat:
    texto: str
    # Acciones completadas en ESTE mensaje (agendar, cancelar, reprogramar,
    # confirmar asistencia), para que el frontend muestre el resultado
    # dentro del chat: [(tipo, resumen de la cita), ...].
    eventos: list[tuple[str, dict]] = field(default_factory=list)
    # El mensaje activó la detección de urgencias (la IA no intervino).
    urgencia: bool = False


_conversaciones: dict[uuid.UUID, _Conversacion] = {}
_lock = threading.Lock()


def _obtener(paciente_id: uuid.UUID) -> _Conversacion:
    ahora = datetime.now(timezone.utc)
    with _lock:
        vencidas = [
            pid
            for pid, c in _conversaciones.items()
            if ahora - c.ultima_actividad > _EXPIRA_TRAS and not c.ocupada.locked()
        ]
        for pid in vencidas:
            del _conversaciones[pid]
        if paciente_id not in _conversaciones:
            _conversaciones[paciente_id] = _Conversacion()
        return _conversaciones[paciente_id]


def _para_historial(mensaje: ChatCompletionMessage) -> dict:
    # model_dump conserva campos extra del proveedor (Gemini adjunta a
    # cada tool_call una firma que exige recibir de vuelta en el
    # siguiente turno). "annotations" solo existe en respuestas.
    datos = mensaje.model_dump(exclude_none=True)
    datos.pop("annotations", None)
    return datos


def _recortar(conv: _Conversacion) -> None:
    if len(conv.mensajes) <= _MAX_MENSAJES:
        return
    # Se corta siempre al inicio de un mensaje del paciente: cortar entre
    # un tool_call y su resultado deja un historial que la API rechaza.
    desde = len(conv.mensajes) - _MAX_MENSAJES
    while desde < len(conv.mensajes) and conv.mensajes[desde]["role"] != "user":
        desde += 1
    del conv.mensajes[:desde]


# Algunos proveedores ignoran parallel_tool_calls=False: aquí se impone
# una sola escritura por mensaje del paciente, para que un "sí" no
# confirme dos cosas.
_UNA_ACCION_POR_MENSAJE = {
    "error": "Solo se puede hacer una acción por mensaje del paciente. Termina esta primero."
}


def _ciclo(db: Session, paciente: Paciente, conv: _Conversacion) -> str:
    sistema = {"role": "system", "content": ia.instrucciones_sistema(paciente.nombre)}
    escrituras = 0

    for _ in range(_MAX_PASOS):
        mensaje = ia.completar([sistema, *conv.mensajes])
        conv.mensajes.append(_para_historial(mensaje))

        if not mensaje.tool_calls:
            return (mensaje.content or "").strip() or _RESPUESTA_SIN_CIERRE

        # La API exige una respuesta por cada tool_call, aunque sea un error.
        for llamada in mensaje.tool_calls:
            es_escritura = llamada.function.name in ia.TOOLS_ESCRITURA
            resultado = (
                _UNA_ACCION_POR_MENSAJE
                if es_escritura and escrituras >= 1
                else herramientas_ia.ejecutar(
                    db, paciente, conv.estado, llamada.function.name, llamada.function.arguments
                )
            )
            escrituras += es_escritura
            conv.mensajes.append(
                {
                    "role": "tool",
                    "tool_call_id": llamada.id,
                    "content": json.dumps(resultado, ensure_ascii=False, default=str),
                }
            )

    logger.warning("El modelo superó %s pasos sin dar una respuesta final.", _MAX_PASOS)
    conv.mensajes.append({"role": "assistant", "content": _RESPUESTA_SIN_CIERRE})
    return _RESPUESTA_SIN_CIERRE


def _responder_urgencia(
    conv: _Conversacion, paciente: Paciente, texto: str, urgencia: urgencias.Urgencia
) -> RespuestaChat:
    # Solo la categoría va al log: el texto del paciente es un dato de salud.
    logger.warning("Urgencia detectada (%s) para el paciente %s.", urgencia.categoria, paciente.id)

    # Nunca se bloquea una urgencia con "espere su mensaje anterior": si
    # la conversación está ocupada, se responde igual, sin tocar el historial.
    if conv.ocupada.acquire(blocking=False):
        try:
            conv.estado.turno += 1
            conv.mensajes.append({"role": "user", "content": texto})
            conv.mensajes.append({"role": "assistant", "content": urgencia.mensaje})
            # Lo que estaba por confirmarse queda sin efecto: un "sí"
            # posterior no debe agendar algo pendiente de antes de la urgencia.
            conv.estado.confirmaciones_pendientes.clear()
            _recortar(conv)
        finally:
            conv.ultima_actividad = datetime.now(timezone.utc)
            conv.ocupada.release()

    return RespuestaChat(texto=urgencia.mensaje, urgencia=True)


def responder(db: Session, paciente: Paciente, texto: str) -> RespuestaChat:
    conv = _obtener(paciente.id)

    # --- Urgencias: se revisa en Python ANTES de llamar al modelo ---
    urgencia = urgencias.detectar(texto)
    if urgencia is not None:
        return _responder_urgencia(conv, paciente, texto, urgencia)

    if not conv.ocupada.acquire(blocking=False):
        raise ConversacionOcupadaError(
            "Todavía estoy respondiendo su mensaje anterior. Espere un momento."
        )

    try:
        inicio = len(conv.mensajes)
        eventos_antes = len(conv.estado.eventos)
        conv.estado.turno += 1
        conv.mensajes.append({"role": "user", "content": texto})

        try:
            respuesta = _ciclo(db, paciente, conv)
        except AsistenteNoDisponibleError:
            # Se deshace el turno para que el paciente pueda reenviar el
            # mismo mensaje. También se descartan los resúmenes que se
            # prepararon en este turno: el paciente nunca los vio, así
            # que no pueden contar como mostrados. (Una cita que alcanzó
            # a crearse sigue en estado.citas_creadas: si se repite la
            # confirmación, se devuelve la misma en vez de duplicarla.)
            del conv.mensajes[inicio:]
            conv.estado.confirmaciones_pendientes = {
                clave: turno
                for clave, turno in conv.estado.confirmaciones_pendientes.items()
                if turno < conv.estado.turno
            }
            raise

        _recortar(conv)
        return RespuestaChat(texto=respuesta, eventos=conv.estado.eventos[eventos_antes:])
    finally:
        conv.ultima_actividad = datetime.now(timezone.utc)
        conv.ocupada.release()


def historial_visible(paciente_id: uuid.UUID) -> list[dict]:
    """Lo que el paciente ve en pantalla: sus mensajes y las respuestas
    de texto del asistente (sin llamadas a funciones)."""
    with _lock:
        conv = _conversaciones.get(paciente_id)
        if conv is None or datetime.now(timezone.utc) - conv.ultima_actividad > _EXPIRA_TRAS:
            return []
        mensajes = list(conv.mensajes)
    return [
        {"rol": "paciente" if m["role"] == "user" else "asistente", "texto": m["content"]}
        for m in mensajes
        if m["role"] in ("user", "assistant") and m.get("content")
    ]


def reiniciar(paciente_id: uuid.UUID) -> None:
    with _lock:
        _conversaciones.pop(paciente_id, None)
