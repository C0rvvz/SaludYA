"""Fórmula médica de una cita atendida y farmacias donde reclamarla (ver formulas_service)."""

import uuid
from datetime import date, datetime, time
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class Medicamento(BaseModel):
    """Una fila sin nombre se ignora; con nombre, debe decir cómo tomarlo (formulas_service)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    nombre: str = Field(default="", max_length=120)  # "Amoxicilina"
    dosis: str = Field(default="", max_length=60)  # "500 mg"
    indicacion: str = Field(default="", max_length=200)  # cada cuánto: "1 cápsula cada 8 horas"
    duracion: str = Field(default="", max_length=80)  # "Durante 7 días"
    cantidad: str = Field(default="", max_length=60)  # "21 cápsulas"


class FormulaRequest(BaseModel):
    """Lo que escribe el personal: el diagnóstico, la nota del médico, los medicamentos y las recomendaciones."""

    model_config = ConfigDict(str_strip_whitespace=True)

    diagnostico: str = Field(min_length=1, max_length=300)
    nota: str | None = Field(default=None, max_length=2000)
    medicamentos: list[Medicamento] = Field(default_factory=list, max_length=15)
    recomendaciones: list[Annotated[str, Field(max_length=300)]] = Field(default_factory=list, max_length=10)
    cubierta_por_eps: bool = True


class FormulaOut(BaseModel):
    codigo: str
    vence_en: date
    cubierta_por_eps: bool
    diagnostico: str
    nota: str | None
    medicamentos: list[Medicamento]
    recomendaciones: list[str]
    registrada_en: datetime
    registrada_por: str
    especialidad: str
    especialista: str
    fecha: date
    hora: time
    sede: str


class FarmaciaOut(BaseModel):
    id: uuid.UUID
    nombre: str
    barrio: str
    ciudad: str
    direccion: str | None
    aliada: bool  # entrega gratis con el código
    distancia_km: float  # desde la sede que tiene cerca
    sede: str | None


class MiFormulaOut(FormulaOut):
    """Lo que ve el paciente: además, el QR de su código y dónde reclamar (las cercanas primero)."""

    qr: str  # imagen SVG como data URI
    farmacias: list[FarmaciaOut]
