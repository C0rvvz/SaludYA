"""
Excepciones de dominio.

Los servicios lanzan estas excepciones en vez de HTTPException
directamente, para que la capa de servicios no dependa de FastAPI —
son los routers los que las traducen a códigos HTTP.
"""


class EpsNoEncontradaError(Exception):
    """La EPS indicada no existe en el catálogo."""


class DocumentoYaRegistradoError(Exception):
    """Ya existe un paciente registrado con ese número de documento."""


class PacienteNoRegistradoError(Exception):
    """No existe ningún paciente con ese número de documento (HU-01)."""


class ReenvioMuyProntoError(Exception):
    """Se solicitó un nuevo código antes de que pasara el tiempo mínimo de espera."""


class OtpNoEncontradoError(Exception):
    """No hay ningún código pendiente de validación para ese paciente."""


class OtpExpiradoError(Exception):
    """El código existe pero ya venció."""


class OtpIncorrectoError(Exception):
    """El código ingresado no coincide con el generado."""

    def __init__(self, mensaje: str, intentos_restantes: int):
        super().__init__(mensaje)
        self.intentos_restantes = intentos_restantes


class OtpIntentosSuperadosError(Exception):
    """Se superó el número máximo de intentos permitidos para este código."""
