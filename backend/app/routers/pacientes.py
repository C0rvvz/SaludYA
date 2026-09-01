"""
Endpoint de registro de paciente — HU-05, HU-06, HU-07, HU-08.

La validación de formato/campos obligatorios (HU-06 criterios 1-3,
HU-07 criterio 4) ocurre en el esquema Pydantic (PacienteRegistroRequest)
y FastAPI la traduce automáticamente a un 422 si falla -- no hay que
repetirla aquí.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.paciente import PacienteRegistroRequest, PacienteRegistroResponse
from app.services import registro_service
from app.services.exceptions import DocumentoYaRegistradoError, EpsNoEncontradaError

router = APIRouter()


@router.post(
    "/pacientes/registro",
    response_model=PacienteRegistroResponse,
    status_code=status.HTTP_201_CREATED,
)
def registrar_paciente(datos: PacienteRegistroRequest, db: Session = Depends(get_db)):
    try:
        return registro_service.registrar_paciente(db, datos)
    except EpsNoEncontradaError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DocumentoYaRegistradoError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
