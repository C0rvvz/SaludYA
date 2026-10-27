"""
Esquemas de entrada/salida para el catálogo de EPS.
"""

import uuid

from pydantic import BaseModel, ConfigDict


class EpsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    nombre_corto: str  # para mostrar junto al médico: "Sura", "Savia", "SOS"
