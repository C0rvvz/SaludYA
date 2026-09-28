"""
Permisos del personal según su rol (apartado de administración).

El rol sale de la cuenta, nunca de lo que se elija al iniciar sesión, y
cada endpoint del personal exige el permiso que necesita (ver
dependencies.requiere). El frontend usa la misma tabla (la recibe al
iniciar sesión) solo para mostrar u ocultar opciones: la seguridad está
aquí, en el backend.
"""

import enum

from app.models.personal import RolPersonal


class Permiso(str, enum.Enum):
    VER_CITAS = "ver_citas"  # HU-34, HU-35, HU-42
    GESTIONAR_CITAS = "gestionar_citas"  # HU-36 a HU-40, HU-43
    REGISTRAR_ATENCION = "registrar_atencion"  # corregir atendida / no asistió (HU-25, HU-43)
    OBSERVACIONES = "observaciones"  # HU-41
    VER_AUDITORIA = "ver_auditoria"  # HU-80 a HU-85
    GESTIONAR_USUARIOS = "gestionar_usuarios"


PERMISOS_POR_ROL: dict[RolPersonal, frozenset[Permiso]] = {
    RolPersonal.ADMINISTRADOR: frozenset(Permiso),
    RolPersonal.AGENDAMIENTO: frozenset(
        {Permiso.VER_CITAS, Permiso.GESTIONAR_CITAS, Permiso.OBSERVACIONES}
    ),
    RolPersonal.CALL_CENTER: frozenset(
        {Permiso.VER_CITAS, Permiso.GESTIONAR_CITAS, Permiso.OBSERVACIONES}
    ),
    RolPersonal.COORDINADOR_MEDICO: frozenset(
        {Permiso.VER_CITAS, Permiso.REGISTRAR_ATENCION, Permiso.OBSERVACIONES}
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
