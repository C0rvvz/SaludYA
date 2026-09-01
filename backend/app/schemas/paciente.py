"""
Esquemas de entrada/salida del registro de paciente — HU-05, HU-06,
HU-07, HU-08.

SUPUESTO que estoy tomando (no viene de ningún criterio de aceptación
explícito, lo marco para que lo valides): el número de WhatsApp se
valida como celular colombiano (10 dígitos, empieza en 3), porque más
adelante el login (HU-02) va a enviar el código OTP a ese mismo
número. Si tu alcance real incluye pacientes con números de otros
países, avísame y lo ajusto.
"""

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.paciente import TipoDocumento, EstadoAfiliacion
from app.schemas.eps import EpsOut
from app.schemas.validators import validar_formato_numero_documento


class PacienteRegistroRequest(BaseModel):
    # --- HU-01/HU-06: identificación y datos personales ---
    tipo_documento: TipoDocumento
    numero_documento: str
    nombre: str
    telefono_whatsapp: str
    correo: EmailStr | None = None

    # --- HU-08: EPS declarada por el paciente ---
    eps_id: uuid.UUID

    # --- HU-07: tratamiento de datos ---
    acepto_tratamiento_datos: bool

    @field_validator("numero_documento")
    @classmethod
    def validar_numero_documento(cls, v: str) -> str:
        return validar_formato_numero_documento(v)

    @field_validator("nombre")
    @classmethod
    def validar_nombre(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("El nombre debe tener al menos 2 caracteres.")
        return v

    @field_validator("telefono_whatsapp")
    @classmethod
    def validar_telefono(cls, v: str) -> str:
        v = re.sub(r"[\s\-]", "", v)
        if not re.fullmatch(r"3\d{9}", v):
            raise ValueError(
                "El número de WhatsApp debe ser un celular colombiano válido "
                "(10 dígitos, comienza en 3)."
            )
        return v

    @field_validator("acepto_tratamiento_datos")
    @classmethod
    def validar_aceptacion_obligatoria(cls, v: bool) -> bool:
        # HU-07, criterio 4: si es obligatoria, no debe permitir continuar
        # sin aceptarla.
        if v is not True:
            raise ValueError(
                "Debes aceptar el tratamiento de datos personales para "
                "poder registrarte en SaludYA."
            )
        return v


class PacienteRegistroResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo_documento: TipoDocumento
    numero_documento: str
    nombre: str
    telefono_whatsapp: str
    correo: str | None
    eps: EpsOut
    estado_afiliacion: EstadoAfiliacion
    acepto_tratamiento_datos: bool
    fecha_aceptacion_tratamiento: datetime | None
    creado_en: datetime
    mensaje: str
