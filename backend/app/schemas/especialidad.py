"""Esquema del catálogo de especialidades — HU-09."""

import uuid

from pydantic import BaseModel, ConfigDict


class EspecialidadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str


class EspecialidadCatalogoOut(EspecialidadOut):
    # Médicos activos en la red: con 0, el paciente ve que por el momento no hay quien lo atienda.
    medicos: int
