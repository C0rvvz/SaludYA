"""
Auditoría de acciones sobre las citas — HU-80 a HU-85.

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


@dataclass(frozen=True)
class Actor:
    """Quién realiza una acción (HU-81: usuario responsable)."""

    tipo: TipoActor
    id: uuid.UUID | None
    nombre: str

    @classmethod
    def de_paciente(cls, paciente: Paciente, via: str | None = None) -> "Actor":
        """`via`: "asistente", "enlace del recordatorio"... (None = la página)."""
        sufijo = f" (paciente, vía {via})" if via else " (paciente)"
        return cls(TipoActor.PACIENTE, paciente.id, f"{paciente.nombre}{sufijo}")

    @classmethod
    def de_personal(cls, personal: Personal) -> "Actor":
        return cls(TipoActor.PERSONAL, personal.id, f"{personal.nombre} ({NOMBRE_ROL[personal.rol]})")


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
) -> None:
    db.add(
        RegistroAuditoria(
            actor_tipo=actor.tipo,
            actor_id=actor.id,
            actor_nombre=actor.nombre,
            accion=accion,
            descripcion=descripcion,
            detalle=detalle,
            cita_id=cita.id if cita is not None else None,
            paciente_id=cita.paciente_id if cita is not None else paciente_id,
            numero_comprobante=cita.numero_comprobante if cita is not None else None,
            estado_anterior=estado_anterior,
            estado_nuevo=estado_nuevo,
        )
    )
