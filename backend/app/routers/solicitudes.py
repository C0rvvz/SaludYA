"""
Solicitudes de cita del paciente (cartas de petición) — requieren su sesión.

  GET   /solicitudes     las suyas, con su estado y la respuesta
  POST  /solicitudes     radicar una solicitud formal o un derecho de petición
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_paciente
from app.models.paciente import Paciente
from app.repositories import solicitud_cita_repository
from app.schemas.solicitudes import RadicarSolicitudRequest, SolicitudCitaOut
from app.services import solicitudes_service
from app.services.exceptions import SolicitudInvalidaError

router = APIRouter(prefix="/solicitudes", tags=["Solicitudes de cita"])


@router.get("", response_model=list[SolicitudCitaOut])
def mis_solicitudes(paciente: Paciente = Depends(get_current_paciente), db: Session = Depends(get_db)):
    return [solicitudes_service.solicitud_out(s) for s in solicitud_cita_repository.del_paciente(db, paciente.id)]


@router.post("", response_model=SolicitudCitaOut, status_code=status.HTTP_201_CREATED)
def radicar(
    datos: RadicarSolicitudRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        solicitud = solicitudes_service.radicar(
            db, paciente, datos.tipo, datos.especialidad_id, datos.tipo_cita,
            datos.fecha_deseada, datos.motivo, datos.canal,
        )
    except SolicitudInvalidaError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return solicitudes_service.solicitud_out(solicitud_cita_repository.obtener(db, solicitud.id))
