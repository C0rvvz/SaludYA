"""Esquema del catálogo de especialidades — HU-09."""

import uuid

from pydantic import BaseModel, ConfigDict


class EspecialidadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
