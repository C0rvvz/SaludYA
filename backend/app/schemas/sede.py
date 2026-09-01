"""Esquema del catálogo de sedes — HU-13."""

import uuid

from pydantic import BaseModel, ConfigDict


class SedeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    ciudad: str
