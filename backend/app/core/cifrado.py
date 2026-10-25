"""
Cifrado de los datos médicos en la base de datos — RNF-23.

Se cifra lo que escriben pacientes y personal sobre la salud del paciente:
el motivo y la respuesta de cada petición, las observaciones del personal,
el motivo de cancelación y el comentario de la calificación de cada cita,
y el detalle de la auditoría (que copia esos textos). Quien lea la base de
datos o una copia de respaldo ve "aes1:..." en lugar del texto.

- AES-256-GCM (cifrado autenticado): cada valor lleva su propio número
  aleatorio (nonce) de 12 bytes, así que el mismo texto nunca se ve igual
  dos veces; y si alguien altera el valor cifrado, descifrar falla en vez
  de devolver un texto cambiado.
- Cada columna cifra con su propio "contexto" (p. ej. "observaciones.texto")
  como dato asociado: un valor copiado de una columna a otra no se descifra.
- La llave (32 bytes = 256 bits, en base64) viene de CLAVE_CIFRADO_DATOS
  en el .env: nunca en el código ni en git. Para cambiarla, la anterior pasa
  a CLAVES_CIFRADO_ANTERIORES (solo para leer lo ya guardado).
- TextoCifrado: tipo de columna de SQLAlchemy que cifra al guardar y
  descifra al leer. El resto del código trabaja con el texto normal.

SUPUESTO: en estas columnas no se puede buscar ni filtrar desde la base de
datos (cada cifrado es distinto); ninguna consulta lo hace. Las búsquedas
de las pantallas se hacen sobre los datos ya descifrados.
SUPUESTO: sin CLAVE_CIFRADO_DATOS, solo en desarrollo, la llave se deriva
de JWT_SECRET (config.py no deja arrancar sin ella en otro entorno).
"""

import base64
import binascii
import hashlib
import logging
import os
from functools import lru_cache

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.core.config import settings

logger = logging.getLogger("saludya.cifrado")

PREFIJO = "aes1:"  # versión del formato: aes1:base64(nonce + texto cifrado + etiqueta)
NO_DISPONIBLE = "[Dato cifrado no disponible]"
_NONCE = 12


class DatoCifradoInvalidoError(Exception):
    """El valor no se pudo descifrar: fue alterado o se cifró con otra llave."""


def llave_desde_base64(texto: str) -> bytes:
    llave = base64.b64decode(texto.strip(), validate=True)
    if len(llave) != 32:
        raise ValueError("La llave de cifrado debe tener 32 bytes (AES-256), escrita en base64.")
    return llave


def llave_de_desarrollo() -> bool:
    return not settings.clave_cifrado_datos


@lru_cache
def _llaves() -> tuple[AESGCM, ...]:
    """La actual (cifra y descifra) y las anteriores (solo descifran lo guardado antes de cambiarla)."""
    if settings.clave_cifrado_datos:
        actual = llave_desde_base64(settings.clave_cifrado_datos)
    else:
        logger.warning("CLAVE_CIFRADO_DATOS no está configurada: se usa una llave de desarrollo.")
        actual = hashlib.sha256(b"saludya-datos-medicos:" + settings.jwt_secret.encode()).digest()
    anteriores = [llave_desde_base64(c) for c in settings.claves_cifrado_anteriores.split(",") if c.strip()]
    return tuple(AESGCM(llave) for llave in (actual, *anteriores))


def cifrar(texto: str, contexto: str) -> str:
    nonce = os.urandom(_NONCE)
    cifrado = _llaves()[0].encrypt(nonce, texto.encode("utf-8"), contexto.encode("utf-8"))
    return PREFIJO + base64.b64encode(nonce + cifrado).decode("ascii")


def descifrar(valor: str, contexto: str) -> str:
    if not valor.startswith(PREFIJO):
        return valor  # guardado antes de cifrar (la migración los cifra todos)
    try:
        datos = base64.b64decode(valor[len(PREFIJO):], validate=True)
    except (binascii.Error, ValueError):
        raise DatoCifradoInvalidoError("El valor cifrado está dañado.")
    nonce, cifrado = datos[:_NONCE], datos[_NONCE:]
    for llave in _llaves():
        try:
            return llave.decrypt(nonce, cifrado, contexto.encode("utf-8")).decode("utf-8")
        except InvalidTag:
            continue
    raise DatoCifradoInvalidoError("El valor fue alterado o se cifró con otra llave.")


class TextoCifrado(TypeDecorator):
    """Columna de texto que se guarda cifrada (AES-256-GCM) y se lee como texto normal."""

    impl = Text
    cache_ok = True

    def __init__(self, contexto: str):
        super().__init__()
        self.contexto = contexto  # "tabla.columna"

    def process_bind_param(self, value, dialect):
        return None if value is None else cifrar(value, self.contexto)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        try:
            return descifrar(value, self.contexto)
        except DatoCifradoInvalidoError:
            # No se tumba la pantalla entera por un valor dañado: se avisa en el log.
            logger.error("No se pudo descifrar un valor de %s", self.contexto)
            return NO_DISPONIBLE
