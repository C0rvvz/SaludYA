"""
Fecha y hora de Colombia.

Las franjas de disponibilidad guardan fecha y hora LOCALES (sin zona),
así que toda comparación con "ahora" debe hacerse en hora de Colombia,
no en la hora del servidor (el contenedor corre en UTC).
"""

from datetime import date, datetime, time, timedelta, timezone

# Colombia no tiene horario de verano: UTC-5 fijo todo el año.
ZONA_COLOMBIA = timezone(timedelta(hours=-5), "America/Bogota")

DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def ahora_colombia() -> datetime:
    """Fecha y hora actuales de Colombia, sin zona (como las franjas)."""
    return datetime.now(ZONA_COLOMBIA).replace(tzinfo=None)


def hoy_en_colombia() -> date:
    return ahora_colombia().date()


def fecha_legible(fecha: date) -> str:
    """'martes 29 de septiembre'"""
    return f"{DIAS_SEMANA[fecha.weekday()]} {fecha.day} de {MESES[fecha.month - 1]}"


def hora_legible(hora: time) -> str:
    """'3:00 p. m.'"""
    sufijo = "a. m." if hora.hour < 12 else "p. m."
    return f"{(hora.hour % 12) or 12}:{hora.minute:02d} {sufijo}"
