"""corregir etiquetas de los enum a minusculas

Revision ID: d191362e0f1a
Revises: 32d3037675e3
Create Date: 2026-09-01 19:30:17.597252

BUG REAL encontrado al construir la Parte 7: SQLAlchemy, por defecto,
usa el NOMBRE del miembro del enum de Python (p. ej. "PRESENCIAL") como
la etiqueta guardada en el tipo ENUM de PostgreSQL -- no el ".value"
que se documentó en minúsculas ("presencial") en cada modelo. Esto
pasó inadvertido en las Partes 2-6 porque toda la aplicación pasa por
el ORM de SQLAlchemy, que traduce esto de forma transparente en ambas
direcciones. Se rompe en cuanto se insertan datos "en crudo" (como en
una migración de datos), que es exactamente lo que necesita la Parte 7.

Esta migración RENOMBRA las etiquetas ya existentes en los 8 tipos
ENUM del proyecto, de MAYÚSCULA (nombre de Python) a minúscula
(.value documentado). ALTER TYPE ... RENAME VALUE no borra ni mueve
ningún dato -- los valores en Postgres se guardan por posición
interna, no por texto, así que las filas ya existentes (pacientes de
prueba, códigos OTP, etc.) se actualizan automáticamente sin pérdida.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd191362e0f1a'
down_revision: Union[str, None] = '32d3037675e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (tipo_enum, [(ETIQUETA_ACTUAL_MAYUSCULA, etiqueta_nueva_minuscula), ...])
RENOMBRES = [
    ("tipo_documento", [
        ("CEDULA_CIUDADANIA", "cedula_ciudadania"),
        ("CEDULA_EXTRANJERIA", "cedula_extranjeria"),
        ("TARJETA_IDENTIDAD", "tarjeta_identidad"),
        ("PASAPORTE", "pasaporte"),
    ]),
    ("estado_afiliacion", [
        ("PENDIENTE", "pendiente"),
        ("ACTIVA", "activa"),
        ("NO_ENCONTRADA", "no_encontrada"),
    ]),
    ("canal_otp", [
        ("WHATSAPP", "whatsapp"),
    ]),
    ("estado_otp", [
        ("PENDIENTE", "pendiente"),
        ("USADO", "usado"),
        ("EXPIRADO", "expirado"),
        ("INVALIDADO", "invalidado"),
    ]),
    ("modalidad", [
        ("PRESENCIAL", "presencial"),
        ("VIRTUAL", "virtual"),
    ]),
    ("estado_disponibilidad", [
        ("DISPONIBLE", "disponible"),
        ("RESERVADO", "reservado"),
    ]),
    ("canal_contacto", [
        ("WHATSAPP", "whatsapp"),
        ("SMS", "sms"),
        ("CORREO", "correo"),
        ("LLAMADA", "llamada"),
    ]),
    ("estado_cita", [
        ("CONFIRMADA", "confirmada"),
    ]),
]


def upgrade() -> None:
    for tipo_enum, pares in RENOMBRES:
        for etiqueta_vieja, etiqueta_nueva in pares:
            op.execute(
                f'ALTER TYPE {tipo_enum} RENAME VALUE \'{etiqueta_vieja}\' '
                f'TO \'{etiqueta_nueva}\''
            )


def downgrade() -> None:
    for tipo_enum, pares in RENOMBRES:
        for etiqueta_vieja, etiqueta_nueva in pares:
            op.execute(
                f'ALTER TYPE {tipo_enum} RENAME VALUE \'{etiqueta_nueva}\' '
                f'TO \'{etiqueta_vieja}\''
            )
