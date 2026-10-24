"""
Datos que no deben quedar a la vista del personal.

Los enlaces de "confirmar asistencia" llevan un token que sirve de llave:
quien lo tenga puede ver y confirmar la cita sin iniciar sesión. Solo
debe llegarle al paciente en su mensaje; en la auditoría y en las
pantallas del personal se ve "[enlace]".
"""

import re

ENLACE = "[enlace]"

_ENLACE_CON_TOKEN = re.compile(r"https?://\S*?[?&]token=[A-Za-z0-9._~-]+")


def ocultar_enlaces_con_token(texto: str | None) -> str | None:
    return _ENLACE_CON_TOKEN.sub(ENLACE, texto) if texto else texto
