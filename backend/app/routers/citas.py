"""
Endpoint de confirmación de cita — HU-16 (y cierre del criterio 4 de
HU-15).

Requiere paciente autenticado (JWT): la cita se registra a nombre de
quien confirma, tomado del token -- nunca de un campo del body que
alguien pudiera falsear.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_paciente
from app.models.paciente import Paciente
from app.schemas.cita import CitaOut, ConfirmarCitaRequest
from app.services import citas_service
from app.services.exceptions import DisponibilidadNoEncontradaError, HorarioYaNoDisponibleError

router = APIRouter(tags=["Citas"])


@router.post("/citas", response_model=CitaOut, status_code=status.HTTP_201_CREATED)
def confirmar_cita(
    datos: ConfirmarCitaRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        cita = citas_service.confirmar_cita(
            db, paciente.id, datos.disponibilidad_id, datos.canal_recordatorio
        )
    except DisponibilidadNoEncontradaError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HorarioYaNoDisponibleError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    return CitaOut(
        id=cita.id,
        especialista=cita.disponibilidad.especialista,
        sede=cita.disponibilidad.sede,
        modalidad=cita.disponibilidad.modalidad.value,
        fecha=cita.disponibilidad.fecha,
        hora=cita.disponibilidad.hora,
        canal_recordatorio=cita.canal_recordatorio.value,
        estado=cita.estado.value,
        creado_en=cita.creado_en,
        mensaje="Tu cita quedó confirmada.",
    )
