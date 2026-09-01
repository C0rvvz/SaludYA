"""
Esquemas de Especialista (HU-12) y Disponibilidad (HU-10, HU-13, HU-14).
"""

import uuid
from datetime import date, time

from pydantic import BaseModel, ConfigDict

from app.schemas.especialidad import EspecialidadOut
from app.schemas.sede import SedeOut


class EspecialistaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    especialidad: EspecialidadOut
    # --- HU-13/HU-14: sedes y modalidades que ofrece EN GENERAL este
    # especialista (no confundir con la franja concreta de Disponibilidad) ---
    sedes: list[SedeOut]
    modalidades: list[str]


class DisponibilidadOut(BaseModel):
    """
    Una franja horaria concreta. Solo se devuelven las que están en
    estado "disponible" -- HU-10, criterio 3: no mostrar horarios
    ocupados (por eso no hace falta un campo "estado" aquí: si aparece
    en esta lista, ya sabemos que está disponible).
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    especialista_id: uuid.UUID
    sede: SedeOut
    modalidad: str
    fecha: date
    hora: time


class EspecialistaBasicoOut(BaseModel):
    """Versión reducida de EspecialistaOut para embeber en resultados de búsqueda."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    especialidad: EspecialidadOut


class DisponibilidadBusquedaOut(BaseModel):
    """
    Resultado de la búsqueda combinada — HU-11. A diferencia de
    DisponibilidadOut (que ya asume que se eligió un especialista),
    aquí cada franja trae embebido A CUÁL especialista pertenece,
    porque la búsqueda es a través de todos a la vez.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    especialista: EspecialistaBasicoOut
    sede: SedeOut
    modalidad: str
    fecha: date
    hora: time
