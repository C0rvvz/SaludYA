"""Pagar en línea una cita atendida (ver pagos_service y pasarela_pagos)."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.cita import CanalContacto


class TokenTarjetaRequest(BaseModel):
    """Los datos de la tarjeta: van a la pasarela y se cambian por un token. No se guardan."""

    model_config = ConfigDict(str_strip_whitespace=True)

    numero: str = Field(min_length=12, max_length=23)
    cvc: str = Field(min_length=3, max_length=4)
    mes: int = Field(ge=1, le=12)
    anio: int = Field(ge=2000, le=2100)
    titular: str = Field(min_length=1, max_length=80)


class TokenTarjetaOut(BaseModel):
    token: str
    marca: str  # "VISA"
    ultimos4: str


class PagarRequest(BaseModel):
    """Tarjeta: el token y las cuotas. PSE: el banco (el tipo de persona y el correo van a PSE)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    metodo: Literal["tarjeta", "pse"]
    token: str | None = Field(default=None, max_length=80)
    cuotas: int = Field(default=1, ge=1, le=36)
    banco: str | None = Field(default=None, max_length=60)
    tipo_persona: Literal["natural", "empresa"] = "natural"
    correo: str | None = Field(default=None, max_length=150)


class DecisionBancoRequest(BaseModel):
    autoriza: bool


class EnviarComprobanteRequest(BaseModel):
    canal: Literal[CanalContacto.WHATSAPP, CanalContacto.CORREO, CanalContacto.SMS]


class MensajeOut(BaseModel):
    mensaje: str


class PagoOut(BaseModel):
    referencia: str  # "PAG-2026-08812"
    cita_id: uuid.UUID
    metodo: str  # "pse" o "tarjeta"
    estado: str  # "pendiente", "aprobado" o "rechazado"
    valor: int
    detalle: str  # "PSE · Bancolombia" o "VISA •••• 4242 · 1 cuota"
    motivo: str | None  # por qué no se aprobó
    fecha: datetime
    codigo_llegada: str | None  # 4 números, para la máquina de la EPS
    qr_llegada: str | None  # el mismo código en QR (data URI SVG)
    especialidad: str
    especialista: str
    fecha_cita: date


class ResumenPagoOut(BaseModel):
    """Paso "Revisar": qué se paga y cuánto (o el pago aprobado, si ya pagó)."""

    cita_id: uuid.UUID
    especialidad: str
    especialista: str
    sede: str
    fecha: date
    concepto: str  # "Copago EPS Sura"
    valor: int
    pendiente: bool  # ya la atendieron y falta pagarla
    pago: PagoOut | None
    bancos: list[str]
    correo: str | None  # para llenar el correo de PSE
