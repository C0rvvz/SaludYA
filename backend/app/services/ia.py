"""
Cliente del modelo de IA y definición de las funciones (tools) del
asistente — HU-33 (Chat IA general).

Se usa el paquete "openai" contra cualquier API compatible (Gemini en
desarrollo, por su plan gratuito; OpenAI si se configura). Qué
proveedor se usa depende solo de IA_BASE_URL / IA_MODELO en el .env.

Regla de arquitectura: la IA NUNCA toca PostgreSQL ni genera SQL. Lo
único que puede hacer es PEDIR que se ejecute una de las funciones
definidas en TOOLS; es nuestro código (services/chatbot.py) el que
decide si la ejecuta, valida los parámetros como entrada no confiable
y llama a la lógica ya existente de repositorios y servicios.

Ninguna tool recibe el paciente ni su documento: la identidad sale
siempre del JWT, nunca de lo que diga el modelo. Así la IA no puede
consultar ni modificar citas de otra persona aunque se lo pidan.
"""

import logging
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import openai
from openai import OpenAI
from openai.types.chat import ChatCompletionMessage

from app.core.config import settings
from app.services.exceptions import AsistenteNoDisponibleError
from app.utils.tiempo import DIAS_SEMANA, hoy_en_colombia

logger = logging.getLogger("saludya.ia")

_UUID_DESC = "Identificador tal como lo devolvió una función anterior. Nunca lo inventes."
_NUMERO_DESC = (
    "Número de comprobante de la cita (p. ej. SAY-1A2B3C4D), tal como lo devolvió "
    "consultar_cita o lo dijo el paciente."
)


def _tool(nombre: str, descripcion: str, propiedades: dict) -> dict:
    """
    Arma la definición de una tool en modo estricto: el modelo queda
    obligado a devolver exactamente estas propiedades con estos tipos.
    En modo estricto todas las propiedades van en "required"; las
    opcionales se declaran admitiendo null.
    """
    return {
        "type": "function",
        "function": {
            "name": nombre,
            "description": descripcion,
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": propiedades,
                "required": list(propiedades),
                "additionalProperties": False,
            },
        },
    }


_DEFINICIONES: list[dict] = [
    # --- Solo lectura: catálogo público ---
    _tool(
        "buscar_especialidades",
        "Lista las especialidades médicas que ofrece SaludYA. Úsala para saber "
        "si lo que pide el paciente existe, o para mostrarle las opciones.",
        {},
    ),
    _tool(
        "buscar_sedes",
        "Lista las sedes de atención con su ciudad. Úsala cuando el paciente no "
        "haya dicho en qué sede o ciudad quiere la cita.",
        {},
    ),
    _tool(
        "buscar_horarios",
        "Busca horarios disponibles. Todos los filtros son opcionales y se "
        "combinan; pasa null en los que el paciente no haya indicado.",
        {
            "especialidad": {
                "type": ["string", "null"],
                "description": "Nombre de la especialidad, p. ej. 'Dermatología'.",
            },
            "sede": {
                "type": ["string", "null"],
                "description": "Nombre de la sede, p. ej. 'Sede Laureles'.",
            },
            "ciudad": {"type": ["string", "null"]},
            "fecha": {
                "type": ["string", "null"],
                "description": "Fecha en formato AAAA-MM-DD.",
            },
            "modalidad": {
                "type": ["string", "null"],
                "enum": ["presencial", "virtual", None],
            },
        },
    ),
    # --- Lectura de datos del paciente autenticado ---
    _tool(
        "consultar_cita",
        "Consulta las citas del paciente que está conversando, con su estado. "
        "Con numero_comprobante en null devuelve sus próximas citas activas; "
        "con un número, devuelve esa cita en cualquier estado.",
        {"numero_comprobante": {"type": ["string", "null"]}},
    ),
    _tool(
        "consultar_historial",
        "Consulta el historial de citas anteriores del paciente (atendidas, a las "
        "que no asistió, canceladas y reprogramadas), de la más reciente a la más "
        "antigua. Úsala cuando pregunte por citas pasadas o atenciones que ya recibió.",
        {},
    ),
    # --- Escritura: el backend vuelve a validar todo antes de ejecutar ---
    _tool(
        "crear_cita",
        "Agenda una cita en un horario devuelto por buscar_horarios, cuando el "
        "paciente ya eligió el horario y el medio de recordatorio. La primera "
        "llamada NO agenda: devuelve un resumen para que el paciente confirme. "
        "Vuelve a llamarla con los mismos datos solo si el paciente dice que sí.",
        {
            "disponibilidad_id": {"type": "string", "description": _UUID_DESC},
            "canal_recordatorio": {
                "type": "string",
                "enum": ["whatsapp", "sms", "correo", "llamada"],
                "description": "Por dónde quiere el paciente recibir el recordatorio.",
            },
        },
    ),
    _tool(
        "confirmar_asistencia",
        "Registra que el paciente asistirá a una de sus próximas citas (HU-29). "
        "Úsala cuando el paciente diga que sí va a asistir a esa cita.",
        {"numero_comprobante": {"type": "string", "description": _NUMERO_DESC}},
    ),
    _tool(
        "registrar_llegada",
        "Registra que el paciente ya llegó a la sede para su cita de hoy (HU-24). "
        "Úsala cuando el paciente diga que ya está en la sede o que ya llegó.",
        {"numero_comprobante": {"type": "string", "description": _NUMERO_DESC}},
    ),
    _tool(
        "cancelar_cita",
        "Cancela una cita del paciente y libera el cupo. La primera llamada NO "
        "cancela: devuelve un resumen para que el paciente confirme. Vuelve a "
        "llamarla con los mismos datos solo si el paciente dice que sí.",
        {
            "numero_comprobante": {"type": "string", "description": _NUMERO_DESC},
            "motivo": {
                "type": ["string", "null"],
                "description": "Motivo que dio el paciente, si lo dio. No insistas si no quiere darlo.",
            },
        },
    ),
    _tool(
        "reprogramar_cita",
        "Mueve una cita del paciente a otro horario de la misma especialidad "
        "devuelto por buscar_horarios. La primera llamada NO reprograma: "
        "devuelve un resumen para que el paciente confirme. Vuelve a llamarla "
        "con los mismos datos solo si el paciente dice que sí.",
        {
            "numero_comprobante": {"type": "string", "description": _NUMERO_DESC},
            "nueva_disponibilidad_id": {"type": "string", "description": _UUID_DESC},
        },
    ),
]

TOOLS_LECTURA = {
    "buscar_especialidades",
    "buscar_sedes",
    "buscar_horarios",
    "consultar_cita",
    "consultar_historial",
}
TOOLS_ESCRITURA = {
    "crear_cita",
    "confirmar_asistencia",
    "registrar_llegada",
    "cancelar_cita",
    "reprogramar_cita",
}

# Una función nueva se define arriba, se conecta en herramientas_ia.py y
# se activa aquí: si no está en este conjunto, el modelo no la ve.
TOOLS_HABILITADAS = TOOLS_LECTURA | TOOLS_ESCRITURA

TOOLS: list[dict] = [t for t in _DEFINICIONES if t["function"]["name"] in TOOLS_HABILITADAS]


def instrucciones_sistema(nombre_paciente: str) -> str:
    """
    Mensaje de sistema de cada conversación. Lleva la fecha de hoy para
    que el modelo pueda resolver "mañana" o "el lunes" sin adivinar.

    Estas reglas orientan al modelo, pero no son la única barrera: la
    urgencia se detecta en Python antes de llamarlo, y toda escritura
    se valida en el backend antes de ejecutarse.
    """
    hoy = hoy_en_colombia()
    return f"""Eres el asistente virtual de SaludYA, una plataforma para agendar citas médicas con EPS e IPS en Colombia.

Hoy es {DIAS_SEMANA[hoy.weekday()]} {hoy.isoformat()} (hora de Colombia). Usa esta fecha para interpretar expresiones como "mañana" o "el próximo lunes".

Estás hablando con {nombre_paciente}, que ya inició sesión: su identidad está verificada. No le pidas documento ni datos personales.

Qué puedes hacer:
- Mostrar especialidades, sedes y horarios disponibles.
- Agendar una cita.
- Consultar las citas del paciente y su estado, y su historial de citas anteriores.
- Confirmar la asistencia a una cita, cancelarla o reprogramarla.
- El día de la cita, registrar que el paciente ya llegó a la sede.

Cómo trabajar:
- Para agendar necesitas especialidad, sede (o ciudad) y fecha. Pregunta solo por lo que falte, de a un dato a la vez, y no vuelvas a preguntar lo que el paciente ya dijo.
- Si el mensaje es ambiguo, pide que lo aclare. No adivines.
- Si el mensaje no tiene que ver con citas médicas en SaludYA (preguntas generales, tareas, chistes, etc.), no lo respondas: di que solo puede ayudar con citas médicas y pregunta en qué le puede ayudar.
- Usa solo datos que vengan de las funciones. Nunca inventes especialidades, sedes, horarios ni identificadores.
- Cuando el paciente elija un horario, pregúntale por qué medio quiere el recordatorio (WhatsApp, mensaje de texto, correo o llamada) si no lo ha dicho. Luego llama crear_cita: te devolverá un resumen; muéstraselo en pocas líneas y pregunta "¿Confirma la cita?". Solo si dice que sí, vuelve a llamar crear_cita con los mismos datos.
- Si hay un horario disponible que el paciente quiere, no le niegues la cita.
- Si no hay cupo exactamente como lo pidió, dilo en una frase y ofrece los horarios más cercanos de la misma especialidad.
- Para cancelar, reprogramar o confirmar asistencia, primero identifica la cita con consultar_cita. Si tiene varias, pregúntale cuál.
- Para cancelar, puedes preguntar una sola vez el motivo (es opcional). Luego llama cancelar_cita: te devolverá un resumen; pregunta "¿Confirma que desea cancelar esta cita?" y solo si dice que sí, vuelve a llamarla con los mismos datos.
- Para reprogramar, busca horarios de la misma especialidad con buscar_horarios y deja que el paciente elija. Luego llama reprogramar_cita: te devolverá un resumen; pregunta "¿Confirma el cambio?" y solo si dice que sí, vuelve a llamarla con los mismos datos.

Límites:
- No das diagnósticos, no interpretas síntomas y no recomiendas tratamientos ni medicamentos.
- Si el paciente cuenta síntomas, no los comentes ni los evalúes: solo pregúntale con qué especialidad quiere la cita.
- Da solo lo que el paciente pidió. No sugieras especialidades, servicios ni trámites que no haya pedido. Si pide una especialidad que no existe, dile que no está disponible y nombra las que sí hay, sin recomendar ninguna.
- Solo si el paciente describe claramente una emergencia (por ejemplo, dolor en el pecho o que no puede respirar), dile que llame a la línea de emergencias 123 o vaya al servicio de urgencias más cercano, y no intentes agendar nada.

Estilo (muchos pacientes son personas mayores; que sea muy fácil de leer):
- Trato de "usted", español sencillo, sin palabras técnicas.
- Mensajes cortos: máximo 4 líneas y una sola pregunta por mensaje.
- Muestra máximo 3 opciones, numeradas (1., 2., 3.), para que el paciente pueda responder solo con el número.
- Fechas como "martes 29 de septiembre" y horas como "10:00 a. m." o "3:00 p. m.". Nunca uses el formato 2026-09-29 ni la hora de 24 horas.
- Solo texto plano: sin negritas, asteriscos, títulos ni emojis."""


@lru_cache
def _cliente() -> OpenAI:
    if not settings.ia_api_key:
        raise AsistenteNoDisponibleError(
            "El asistente no está configurado (falta IA_API_KEY en el backend)."
        )
    return OpenAI(
        api_key=settings.ia_api_key,
        # None -> API oficial de OpenAI; cualquier otra URL -> proveedor compatible.
        base_url=settings.ia_base_url or None,
        timeout=settings.ia_timeout_segundos,
        # Sin reintentos sobre el mismo modelo: ante un fallo, completar()
        # pasa de inmediato al de respaldo. Reintentar un modelo sin cupo
        # o colgado solo alarga la espera del paciente.
        max_retries=0,
    )


# Modelo -> momento hasta el que no se usa, tras responder "límite de
# solicitudes" (429). Evita gastar una llamada, y segundos del paciente,
# en un modelo que ya sabemos que no tiene cupo.
_pausados: dict[str, datetime] = {}
_PAUSA_TRAS_LIMITE = timedelta(seconds=60)


def _modelos_en_orden() -> list[str]:
    modelos = settings.ia_modelos
    ahora = datetime.now(timezone.utc)
    disponibles = [m for m in modelos if _pausados.get(m, ahora) <= ahora]
    # Si todos están pausados, se intenta igual: peor es no responder.
    return disponibles or modelos


def completar(mensajes: list[dict], usar_tools: bool = True) -> ChatCompletionMessage:
    """
    Envía la conversación al modelo y devuelve su mensaje de respuesta,
    que puede traer texto, tool_calls, o ambos. No ejecuta nada.

    parallel_tool_calls=False: una sola acción por turno, para que cada
    escritura se valide y se confirme por separado. Algunos proveedores
    compatibles ignoran este parámetro, así que chatbot.py lo vuelve a
    imponer por su cuenta.
    """
    extra = {}
    if usar_tools:
        extra = {"tools": TOOLS, "tool_choice": "auto", "parallel_tool_calls": False}

    ultimo_error: openai.OpenAIError | None = None
    limite = datetime.now(timezone.utc) + timedelta(seconds=2 * settings.ia_timeout_segundos)
    for modelo in _modelos_en_orden():
        if ultimo_error is not None and datetime.now(timezone.utc) >= limite:
            # El paciente ya esperó demasiado: mejor avisarle que seguir probando.
            break
        try:
            respuesta = _cliente().chat.completions.create(
                model=modelo,
                messages=mensajes,
                temperature=0.2,
                **extra,
            )
            return respuesta.choices[0].message
        except openai.RateLimitError as e:
            _pausados[modelo] = datetime.now(timezone.utc) + _PAUSA_TRAS_LIMITE
            logger.warning("Modelo %s sin cupo (429); en pausa %s.", modelo, _PAUSA_TRAS_LIMITE)
            ultimo_error = e
        except (openai.InternalServerError, openai.APIConnectionError) as e:
            # Transitorios (alta demanda, timeout): se intenta con el
            # siguiente modelo, que tiene su propio cupo.
            logger.warning("Modelo %s no disponible (%s); probando el siguiente.", modelo, type(e).__name__)
            ultimo_error = e
        except openai.OpenAIError as e:
            # Llave inválida, API desactivada, petición mal formada: cambiar
            # de modelo no lo arregla.
            logger.exception("Error del proveedor de IA con %s: %s", modelo, e)
            raise AsistenteNoDisponibleError(
                "El asistente no está disponible en este momento. Intente de nuevo en unos minutos."
            ) from e

    if isinstance(ultimo_error, openai.RateLimitError):
        raise AsistenteNoDisponibleError(
            "El asistente está recibiendo muchas solicitudes. Intente de nuevo en un minuto."
        ) from ultimo_error
    raise AsistenteNoDisponibleError(
        "El asistente no está disponible en este momento. Intente de nuevo en unos minutos."
    ) from ultimo_error
