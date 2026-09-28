"""
Detección de posibles urgencias — HU-33, criterio 4 (redirección a un
canal de urgencias cuando corresponda).

Se ejecuta en Python ANTES de llamar al modelo, con reglas fijas: no
depende de que la IA obedezca una instrucción, ni de que el proveedor
de IA esté disponible. Si se activa, el chat responde un mensaje fijo
y la IA ni siquiera recibe el mensaje.

Criterio de diseño: ante la duda, redirigir. Un falso positivo le
cuesta al paciente leer un mensaje de más; un falso negativo puede
costar mucho más. Por eso no se intenta interpretar negaciones ("no
tengo dolor de pecho" también redirige).

No es un triaje médico: solo detecta frases que en ningún caso deben
esperar a una cita agendada.
"""

import re
import unicodedata
from dataclasses import dataclass

MENSAJE_URGENCIA = (
    "Lo que describe puede ser una urgencia. No espere una cita.\n"
    "Llame ahora a la línea de emergencias 123 o vaya al servicio de urgencias más cercano.\n"
    "Si está con alguien, pídale ayuda."
)

# Riesgo suicida: además del 123, la línea nacional de salud mental del
# Ministerio de Salud (gratuita, 24 horas).
MENSAJE_SALUD_MENTAL = (
    "Lo que siente es importante y no tiene que enfrentarlo sin ayuda.\n"
    "Si está en peligro, llame ahora a la línea de emergencias 123.\n"
    "También puede hablar con un profesional en la Línea 192, opción 4 (gratis, las 24 horas)."
)

# Patrones sobre texto normalizado: minúsculas, sin tildes, sin signos
# de puntuación y con un solo espacio entre palabras.
_PATRONES: dict[str, list[str]] = {
    "dolor_pecho": [
        r"\bdolor (muy )?(fuerte )?(en|de|del) (el )?pecho\b",
        r"\bme duele (mucho )?el pecho\b",
        r"\b(opresion|presion|apreton) (en|del) (el )?pecho\b",
        r"\binfarto\b",
    ],
    "respiracion": [
        r"\bno (puedo|puede|pueden|podemos) respirar\b",
        r"\b(me|le|nos) falta (el )?aire\b",
        r"\b(me ahogo|se ahoga|se esta ahogando)\b",
        r"\bdificultad (para|al) respirar\b",
        r"\bno respira\b",
        r"\b(se atraganto|se esta asfixiando|se asfixia)\b",
    ],
    "sangrado": [
        r"\bsangrado (muy )?(abundante|fuerte|que no para)\b",
        r"\b(sangra|sangro|sangrando) (mucho|demasiado|sin parar)\b",
        r"\bno (para|deja) de sangrar\b",
        r"\bhemorragia\b",
        r"\b(vomit\w*|tos\w*) (con )?sangre\b",
    ],
    "conciencia": [
        r"\bperdida (de la|del|de) (conciencia|conocimiento)\b",
        r"\bperdi(o)? (el )?(conocimiento|sentido)\b",
        r"\b(se|me) desmay\w*\b",
        r"\binconsciente\b",
        r"\bno (reacciona|despierta)\b",
        r"\bconvulsi\w*\b",
    ],
    "acv": [
        r"\b(derrame cerebral|acv)\b",
        r"\b(cara|boca) (torcida|caida)\b",
        r"\bno (puedo|puede) (mover|sentir) (el|la|un|una|medio)\b",
        r"\bhabla enredad\w*\b",
    ],
    "trauma": [
        r"\b(me|lo|la|le|nos) atropell\w*\b",
        r"\bherida (muy )?profunda\b",
        r"\bfractura expuesta\b",
        r"\bquemadura (muy )?(grave|grande|fuerte)\b",
        r"\bgolpe (muy )?(fuerte )?en la cabeza\b",
    ],
    "intoxicacion": [
        r"\b(intoxica|envenena)\w*\b",
        r"\bsobredosis\b",
        r"\b(tome|tomo|trague|trago) (muchas|demasiadas|todas las) (pastillas|pastas)\b",
    ],
    "alergia": [
        r"\breaccion alergica (muy )?(grave|fuerte)\b",
        r"\bse (me|le) (esta )?cerrando la garganta\b",
        r"\b(garganta|lengua|labios) hinchad\w*\b",
    ],
    "embarazo": [
        r"\b(se me rompio|rompi|se rompio) (la )?fuente\b",
        r"\bembarazad\w*\b.{0,40}\bsangr\w*",
        r"\bsangr\w*\b.{0,40}\bembaraz\w*",
    ],
    "salud_mental": [
        r"\bsuicid\w*\b",
        r"\b(quiero|quisiera|me voy a|voy a) (morir|morirme|matarme)\b",
        r"\bquitarme la vida\b",
        r"\bacabar con mi vida\b",
        r"\bhacerme dano\b",
        r"\bno quiero (seguir )?vivir\b",
    ],
}

_REGEX = {categoria: [re.compile(p) for p in patrones] for categoria, patrones in _PATRONES.items()}


@dataclass(frozen=True)
class Urgencia:
    categoria: str
    mensaje: str


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    solo_letras = re.sub(r"[^a-z0-9 ]", " ", sin_tildes.lower())
    return " ".join(solo_letras.split())


def detectar(texto: str) -> Urgencia | None:
    """Devuelve la urgencia detectada en el mensaje, o None si no hay."""
    normalizado = _normalizar(texto)
    # Salud mental primero: su mensaje es distinto y tiene prioridad si
    # el mensaje mezcla varias señales.
    for categoria in ("salud_mental", *(c for c in _REGEX if c != "salud_mental")):
        if any(r.search(normalizado) for r in _REGEX[categoria]):
            mensaje = MENSAJE_SALUD_MENTAL if categoria == "salud_mental" else MENSAJE_URGENCIA
            return Urgencia(categoria=categoria, mensaje=mensaje)
    return None
