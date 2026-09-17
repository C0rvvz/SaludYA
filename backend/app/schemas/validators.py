"""Validadores reutilizables entre distintos esquemas Pydantic."""

import re

# Pasaporte es la única excepción con letras (p. ej. formato colombiano
# AV123456). El resto de tipos de documento (cédula de ciudadanía,
# cédula de extranjería, tarjeta de identidad) son siempre numéricos.
PATRON_SOLO_DIGITOS = re.compile(r"^\d{6,15}$")
PATRON_ALFANUMERICO = re.compile(r"^[A-Za-z0-9]{6,15}$")


def validar_formato_numero_documento(v: str, permitir_letras: bool = False) -> str:
    v = v.strip().upper()

    if permitir_letras:
        if not PATRON_ALFANUMERICO.fullmatch(v):
            raise ValueError(
                "El número de documento debe tener entre 6 y 15 caracteres "
                "alfanuméricos (solo letras y números, sin espacios ni símbolos)."
            )
        return v

    if not PATRON_SOLO_DIGITOS.fullmatch(v):
        raise ValueError(
            "El número de documento debe contener solo dígitos y tener "
            "entre 6 y 15 caracteres."
        )
    return v