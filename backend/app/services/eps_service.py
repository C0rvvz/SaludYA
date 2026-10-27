"""
Con qué médicos puede agendar cada paciente, según su EPS, y cuánto cuesta.

- Con los de su EPS: copago (TARIFAS["eps"]).
- Con los de una EPS aliada (comparten sus médicos; ver alianzas_eps):
  copago un poco mayor (TARIFAS["aliada"]).
- Con un médico particular (sin EPS): cualquiera puede, pagando la consulta
  particular (TARIFAS["particular"]). Un paciente sin EPS paga así con
  cualquier médico.
- Con los de otra EPS no aliada, no.

Se aplica en todo lugar donde se asigna un horario: agendar, reprogramar
(el paciente o el personal), Eli, la lista de espera y las peticiones. La
lista de espera, Eli y el personal ofrecen solo los de su EPS y aliadas
(no un particular, que cuesta más, sin que el paciente lo elija).

SUPUESTO: valores de ejemplo, iguales para todas las especialidades.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.eps import alianzas_eps
from app.models.especialista import Especialista
from app.models.paciente import Paciente
from app.services.exceptions import MedicoDeOtraEpsError

TARIFAS = {"eps": 8000, "aliada": 12000, "particular": 100000}  # pesos colombianos


def aliadas_de(db: Session, eps_id: uuid.UUID) -> set[uuid.UUID]:
    return set(db.scalars(select(alianzas_eps.c.aliada_id).where(alianzas_eps.c.eps_id == eps_id)))


def eps_permitidas(db: Session, paciente: Paciente) -> set[uuid.UUID] | None:
    """Las EPS cuyos médicos cubre la del paciente (la suya y las aliadas); None = particular, sin EPS."""
    if paciente.eps_id is None:
        return None
    return {paciente.eps_id} | aliadas_de(db, paciente.eps_id)


def relacion(db: Session, paciente: Paciente, especialista: Especialista) -> str:
    """"eps", "aliada", "particular" (médico o paciente sin EPS) u "otra" (no puede agendar)."""
    if especialista.eps_id is None or paciente.eps_id is None:
        return "particular"
    if especialista.eps_id == paciente.eps_id:
        return "eps"
    if especialista.eps_id in aliadas_de(db, paciente.eps_id):
        return "aliada"
    return "otra"


def puede_atenderlo(permitidas: set[uuid.UUID] | None, especialista: Especialista) -> bool:
    return permitidas is None or especialista.eps_id is None or especialista.eps_id in permitidas


def cobro(db: Session, paciente: Paciente, especialista: Especialista) -> tuple[str, int]:
    """El tipo de cobro y el valor de la consulta con ese médico (después de validar)."""
    tipo = relacion(db, paciente, especialista)
    return tipo, TARIFAS[tipo]


def validar(db: Session, paciente: Paciente, especialista: Especialista) -> None:
    if relacion(db, paciente, especialista) == "otra":
        raise MedicoDeOtraEpsError(
            f"{especialista.nombre} atiende a afiliados de {especialista.eps.nombre}. "
            f"Elija un médico de {paciente.eps.nombre}, de una EPS aliada o un médico particular."
        )
