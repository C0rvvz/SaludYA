"""Validadores reutilizables entre distintos esquemas Pydantic."""


def validar_formato_numero_documento(v: str) -> str:
    v = v.strip()
    if not v.isdigit():
        raise ValueError("El número de documento debe contener solo dígitos.")
    if not (6 <= len(v) <= 15):
        raise ValueError("El número de documento debe tener entre 6 y 15 dígitos.")
    return v
