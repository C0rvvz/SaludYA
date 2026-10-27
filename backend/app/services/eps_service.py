"""
Con qué médicos puede agendar cada paciente, según su EPS.

- Con los de su EPS y con los de las EPS aliadas (comparten sus médicos;
  ver alianzas_eps).
- Un paciente particular (sin EPS) puede agendar con cualquiera: paga la
  consulta.

Se aplica en todo lugar donde se asigna un horario: agendar, reprogramar
(el paciente o el personal), Eli, la lista de espera y las peticiones.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.eps import alianzas_eps
from app.models.especialista import Especialista
from app.models.paciente import Paciente
from app.services.exceptions import MedicoDeOtraEpsError


def aliadas_de(db: Session, eps_id: uuid.UUID) -> set[uuid.UUID]:
    return set(db.scalars(select(alianzas_eps.c.aliada_id).where(alianzas_eps.c.eps_id == eps_id)))


def eps_permitidas(db: Session, paciente: Paciente) -> set[uuid.UUID] | None:
    """Las EPS cuyos médicos puede usar el paciente; None = cualquiera (particular)."""
    if paciente.eps_id is None:
        return None
    return {paciente.eps_id} | aliadas_de(db, paciente.eps_id)


def puede_atenderlo(permitidas: set[uuid.UUID] | None, especialista: Especialista) -> bool:
    return permitidas is None or especialista.eps_id in permitidas


def validar(db: Session, paciente: Paciente, especialista: Especialista) -> None:
    if not puede_atenderlo(eps_permitidas(db, paciente), especialista):
        raise MedicoDeOtraEpsError(
            f"{especialista.nombre} atiende a afiliados de {especialista.eps.nombre}. "
            f"Elija un médico de {paciente.eps.nombre} o de una EPS aliada."
        )
