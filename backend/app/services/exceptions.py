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


class DisponibilidadNoEncontradaError(Exception):
    """No existe ninguna franja de disponibilidad con ese id."""


class HorarioYaNoDisponibleError(Exception):
    """El horario elegido ya no está disponible al momento de confirmar (HU-16, criterio 3)."""


class CitaNoEncontradaError(Exception):
    """No existe ninguna cita con ese id, o no pertenece al paciente autenticado.

    Se usa el mismo error para ambos casos a propósito (no distinguir
    "no existe" de "no es tuya" evita que alguien confirme, probando
    ids al azar, cuáles citas de otros pacientes sí existen).
    """


class CitaNoModificableError(Exception):
    """La acción no aplica al estado actual de la cita: ya fue cancelada o
    reprogramada, ya pasó, o la asistencia ya estaba confirmada (HU-20,
    HU-21, HU-29)."""


class ReprogramacionInvalidaError(Exception):
    """El horario nuevo no sirve para reprogramar esa cita: es de otra
    especialidad o es el mismo horario actual (HU-20)."""


class EnlaceInvalidoError(Exception):
    """El enlace del recordatorio para confirmar la asistencia no es válido o
    ya venció (HU-23)."""


class FueraDeHorarioDeLlegadaError(Exception):
    """Se intentó registrar la llegada fuera de la ventana de la cita (HU-24)."""


class ResultadoNoRegistrableError(Exception):
    """No se puede registrar si el paciente fue atendido: la cita todavía no
    empieza, o fue cancelada / reprogramada."""


class EnvioFallidoError(Exception):
    """El mensaje al paciente no se pudo enviar por su canal."""


class CredencialesInvalidasError(Exception):
    """Correo o contraseña del personal incorrectos (sin decir cuál de los dos)."""


class CuentaBloqueadaError(Exception):
    """Demasiados intentos fallidos de inicio de sesión del personal."""


class PersonalInvalidoError(Exception):
    """Datos no válidos al crear o modificar una cuenta del personal."""


class AsistenteNoDisponibleError(Exception):
    """El asistente con IA no puede responder: falta la API key, el
    proveedor no respondió a tiempo o devolvió un error."""


class ConversacionOcupadaError(Exception):
    """Llegó un mensaje nuevo mientras el asistente todavía respondía el
    anterior del mismo paciente (p. ej., doble clic o dos pestañas)."""


class ProgramacionInvalidaError(Exception):
    """Datos no válidos al programar un recordatorio (HU-64 / HU-65)."""
