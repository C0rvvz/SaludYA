"""Personal › Historia clínica (ver historia_clinica_service)."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel

from app.schemas.formula import FormulaOut


class PacienteHistoriaOut(BaseModel):
    """Un paciente en el listado, con su última consulta atendida del periodo."""

    paciente_id: uuid.UUID
    cita_id: uuid.UUID  # la de esa última consulta: abre el detalle
    nombre: str
    tipo_documento: str
    numero_documento: str
    eps: str | None  # None: particular
    fecha: date
    especialidad: str
    especialista: str
    formula_estado: str  # entregada, parcial, por_reclamar, vencida, sin_medicamentos o sin_formula
    formula_estado_texto: str
    consultado_en: datetime | None  # la última vez que alguien del personal abrió su historia clínica


class ListadoHistoriaOut(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    pacientes: list[PacienteHistoriaOut]


class PacienteDeLaHistoriaOut(BaseModel):
    id: uuid.UUID
    nombre: str
    tipo_documento: str
    numero_documento: str
    eps: str | None


class ConsultaDeLaHistoriaOut(BaseModel):
    id: uuid.UUID
    numero_comprobante: str
    fecha: date
    hora: time
    especialidad: str
    especialista: str
    sede: str
    canal: str  # por donde se le reenvía el código


class OtraConsultaOut(BaseModel):
    cita_id: uuid.UUID
    fecha: date
    especialidad: str
    especialista: str
    formula_estado: str
    formula_estado_texto: str


class AccesoOut(BaseModel):
    """Una línea de "Quién ha consultado esta fórmula"."""

    quien: str  # "Camila Ortiz (Coordinación médica)" o "Farmacia La Esperanza (farmacia)"
    que: str  # "Consultó la historia clínica", "Entrega con código"...
    fecha: datetime  # la última vez
    veces: int


class HistoriaDetalleOut(BaseModel):
    paciente: PacienteDeLaHistoriaOut
    cita: ConsultaDeLaHistoriaOut
    formula: FormulaOut | None
    qr: str | None  # el del código de la fórmula, para "Descargar fórmula"
    consultas: list[OtraConsultaOut]  # todas las consultas atendidas del paciente, la más reciente primero
    accesos: list[AccesoOut]
    puede_editar: bool  # registrar o corregir la fórmula


class ReenvioOut(BaseModel):
    canal: str
