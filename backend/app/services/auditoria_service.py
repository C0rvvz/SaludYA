"""
Auditoría de acciones sobre las citas — HU-80 a HU-85 — y de los
cambios a las cuentas del personal (quién, a qué cuenta, cuándo).

registrar() agrega el registro a la sesión SIN hacer commit: lo llama el
servicio que ejecuta la acción, justo antes de su propio commit, así que
la acción y su registro se guardan juntos o no se guarda ninguno.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.permisos import NOMBRE_ROL
from app.models.auditoria import RegistroAuditoria, TipoActor
from app.models.cita import Cita
from app.models.paciente import Paciente
from app.models.personal import Personal
from app.utils.privacidad import ocultar_enlaces_con_token


@dataclass(frozen=True)
class Actor:
    """Quién realiza una acción (HU-81: usuario responsable)."""

    tipo: TipoActor
    id: uuid.UUID | None
    nombre: str
    correo: str | None = None  # del personal: con el nombre y el rol, identifica a quien actuó

    @classmethod
    def de_paciente(cls, paciente: Paciente, via: str | None = None) -> "Actor":
        """`via`: "asistente", "enlace del recordatorio"... (None = la página)."""
        sufijo = f" (paciente, vía {via})" if via else " (paciente)"
        return cls(TipoActor.PACIENTE, paciente.id, f"{paciente.nombre}{sufijo}")

    @classmethod
    def de_personal(cls, personal: Personal) -> "Actor":
        return cls(
            TipoActor.PERSONAL, personal.id, f"{personal.nombre} ({NOMBRE_ROL[personal.rol]})", personal.correo
        )


SISTEMA = Actor(TipoActor.SISTEMA, None, "Sistema")


def registrar(
    db: Session,
    actor: Actor,
    accion: str,
    descripcion: str,
    *,
    cita: Cita | None = None,
    paciente_id: uuid.UUID | None = None,
    estado_anterior: str | None = None,
    estado_nuevo: str | None = None,
    detalle: str | None = None,
    cuenta: Personal | None = None,
) -> None:
    """`cuenta`: la cuenta del personal afectada; se guarda su nombre, correo y rol de ese momento."""
    db.add(
        RegistroAuditoria(
            actor_tipo=actor.tipo,
            actor_id=actor.id,
            actor_nombre=actor.nombre,
            actor_correo=actor.correo,
            accion=accion,
            descripcion=descripcion,
            detalle=ocultar_enlaces_con_token(detalle),  # el token de un enlace nunca queda aquí
            cita_id=cita.id if cita is not None else None,
            paciente_id=cita.paciente_id if cita is not None else paciente_id,
            numero_comprobante=cita.numero_comprobante if cita is not None else None,
            estado_anterior=estado_anterior,
            estado_nuevo=estado_nuevo,
            cuenta_id=cuenta.id if cuenta is not None else None,
            cuenta_nombre=cuenta.nombre if cuenta is not None else None,
            cuenta_correo=cuenta.correo if cuenta is not None else None,
            cuenta_rol=NOMBRE_ROL[cuenta.rol] if cuenta is not None else None,
        )
    )
