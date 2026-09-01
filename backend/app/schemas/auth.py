"""
Esquemas de entrada/salida del login de paciente — HU-01, HU-02.
"""

from pydantic import BaseModel, field_validator

from app.schemas.validators import validar_formato_numero_documento


class IdentificarPacienteRequest(BaseModel):
    numero_documento: str

    @field_validator("numero_documento")
    @classmethod
    def validar_numero_documento(cls, v: str) -> str:
        return validar_formato_numero_documento(v)


class IdentificarPacienteResponse(BaseModel):
    registrado: bool
    nombre: str
    mensaje: str


class EnviarOTPRequest(BaseModel):
    numero_documento: str

    @field_validator("numero_documento")
    @classmethod
    def validar_numero_documento(cls, v: str) -> str:
        return validar_formato_numero_documento(v)


class EnviarOTPResponse(BaseModel):
    enviado: bool
    telefono_enmascarado: str
    expira_en_minutos: int
    mensaje: str


class ValidarOTPRequest(BaseModel):
    numero_documento: str
    codigo: str

    @field_validator("numero_documento")
    @classmethod
    def validar_numero_documento(cls, v: str) -> str:
        return validar_formato_numero_documento(v)

    @field_validator("codigo")
    @classmethod
    def validar_codigo(cls, v: str) -> str:
        v = v.strip()
        if not (v.isdigit() and len(v) == 6):
            raise ValueError("El código debe tener exactamente 6 dígitos.")
        return v


class ValidarOTPResponse(BaseModel):
    validado: bool
    mensaje: str


class ReenviarOTPRequest(BaseModel):
    numero_documento: str

    @field_validator("numero_documento")
    @classmethod
    def validar_numero_documento(cls, v: str) -> str:
        return validar_formato_numero_documento(v)


class ReenviarOTPResponse(BaseModel):
    reenviado: bool
    telefono_enmascarado: str
    expira_en_minutos: int
    mensaje: str
