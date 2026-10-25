"""
Permisos del personal según su rol (apartado de administración).

El rol sale de la cuenta, nunca de lo que se elija al iniciar sesión, y
cada endpoint del personal exige el permiso que necesita (ver
dependencies.requiere). El frontend usa la misma tabla (la recibe al
iniciar sesión) solo para mostrar u ocultar opciones: la seguridad está
aquí, en el backend.

Mínimo privilegio: cada rol tiene solo lo que su función necesita.
  - Call center: recordatorios, mensajes programados y llamadas; confirmar asistencia.
  - Agendamiento: confirmar asistencia, reprogramar, cancelar y la lista de espera.
  - Coordinador médico: atención, prioridad médica, peticiones y reportes.
  - Administrador: todo, incluidas la auditoría, la seguridad y las cuentas del personal.
Todos ven las citas y dejan observaciones.
"""

import enum

from app.models.personal import RolPersonal


class Permiso(str, enum.Enum):
    VER_CITAS = "ver_citas"  # HU-34, HU-35, HU-42
    CONFIRMAR_ASISTENCIA = "confirmar_asistencia"  # HU-38
    REPROGRAMAR_CANCELAR = "reprogramar_cancelar"  # HU-39, HU-40
    RECORDATORIOS = "recordatorios"  # HU-36, HU-37, HU-62 a HU-67: recordar, llamar y programar mensajes
    LISTA_ESPERA = "lista_espera"  # HU-45, HU-53 a HU-61: ver la lista, asignar la cita y retirar
    ASIGNAR_PRIORIDAD = "asignar_prioridad"  # HU-56: prioridad médica en la lista de espera
    REVISAR_SOLICITUDES = "revisar_solicitudes"  # HU-76 a HU-79: ver y decidir las peticiones
    REGISTRAR_ATENCION = "registrar_atencion"  # corregir atendida / no asistió (HU-25, HU-43)
    OBSERVACIONES = "observaciones"  # HU-41
    VER_REPORTES = "ver_reportes"  # HU-44, HU-48 a HU-52, HU-68 a HU-75 (Resumen y Reportes)
    VER_AUDITORIA = "ver_auditoria"  # HU-80 a HU-85
    SEGURIDAD = "seguridad"  # panel "Seguridad": eventos, alertas y cerrar sesiones a distancia
    GESTIONAR_USUARIOS = "gestionar_usuarios"


_TODOS = {Permiso.VER_CITAS, Permiso.OBSERVACIONES}

PERMISOS_POR_ROL: dict[RolPersonal, frozenset[Permiso]] = {
    RolPersonal.ADMINISTRADOR: frozenset(Permiso),
    RolPersonal.CALL_CENTER: frozenset(_TODOS | {Permiso.CONFIRMAR_ASISTENCIA, Permiso.RECORDATORIOS}),
    RolPersonal.AGENDAMIENTO: frozenset(
        _TODOS | {Permiso.CONFIRMAR_ASISTENCIA, Permiso.REPROGRAMAR_CANCELAR, Permiso.LISTA_ESPERA}
    ),
    RolPersonal.COORDINADOR_MEDICO: frozenset(
        _TODOS
        | {
            Permiso.REGISTRAR_ATENCION,
            Permiso.ASIGNAR_PRIORIDAD,
            Permiso.REVISAR_SOLICITUDES,
            Permiso.VER_REPORTES,
        }
    ),
}

NOMBRE_ROL = {
    RolPersonal.ADMINISTRADOR: "Administrador",
    RolPersonal.AGENDAMIENTO: "Agendamiento",
    RolPersonal.CALL_CENTER: "Call center",
    RolPersonal.COORDINADOR_MEDICO: "Coordinador médico",
}


def tiene_permiso(rol: RolPersonal, permiso: Permiso) -> bool:
    return permiso in PERMISOS_POR_ROL[rol]
