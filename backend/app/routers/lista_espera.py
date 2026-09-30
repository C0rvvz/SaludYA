"""
Lista de espera del paciente — HU-19, HU-31 y HU-32 (requieren su sesión).

  GET   /lista-espera                  HU-19: mis solicitudes, posición y cupo ofrecido
  POST  /lista-espera                  unirse
  POST  /lista-espera/{id}/aceptar     HU-32: la cita queda registrada
  POST  /lista-espera/{id}/rechazar    HU-32: conserva su lugar
  POST  /lista-espera/{id}/salir       salir de la lista
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_paciente
from app.models.paciente import Paciente
from app.schemas.lista_espera import SolicitudEsperaOut, UnirseListaEsperaRequest
from app.services import lista_espera_service
from app.services.exceptions import HorarioYaNoDisponibleError, ListaEsperaInvalidaError

router = APIRouter(prefix="/lista-espera", tags=["Lista de espera"])


def _http(e: Exception) -> HTTPException:
    codigo = status.HTTP_409_CONFLICT if isinstance(e, HorarioYaNoDisponibleError) else status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=codigo, detail=str(e))


@router.get("", response_model=list[SolicitudEsperaOut])
def mis_solicitudes(paciente: Paciente = Depends(get_current_paciente), db: Session = Depends(get_db)):
    return lista_espera_service.mis_solicitudes(db, paciente)


@router.post("", response_model=SolicitudEsperaOut, status_code=status.HTTP_201_CREATED)
def unirse(
    datos: UnirseListaEsperaRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        solicitud = lista_espera_service.unirse(
            db, paciente, datos.especialidad_id, datos.sede_ids, datos.jornada, datos.modalidad, datos.canal
        )
    except ListaEsperaInvalidaError as e:
        raise _http(e)
    return lista_espera_service.solicitud_out(db, solicitud)


def _responder(accion, solicitud_id: uuid.UUID, paciente: Paciente, db: Session) -> dict:
    try:
        solicitud = accion(db, paciente, solicitud_id)
    except (ListaEsperaInvalidaError, HorarioYaNoDisponibleError) as e:
        raise _http(e)
    return lista_espera_service.solicitud_out(db, solicitud)


@router.post("/{solicitud_id}/aceptar", response_model=SolicitudEsperaOut)
def aceptar(solicitud_id: uuid.UUID, paciente: Paciente = Depends(get_current_paciente), db: Session = Depends(get_db)):
    return _responder(lista_espera_service.aceptar, solicitud_id, paciente, db)


@router.post("/{solicitud_id}/rechazar", response_model=SolicitudEsperaOut)
def rechazar(solicitud_id: uuid.UUID, paciente: Paciente = Depends(get_current_paciente), db: Session = Depends(get_db)):
    return _responder(lista_espera_service.rechazar, solicitud_id, paciente, db)


@router.post("/{solicitud_id}/salir", response_model=SolicitudEsperaOut)
def salir(solicitud_id: uuid.UUID, paciente: Paciente = Depends(get_current_paciente), db: Session = Depends(get_db)):
    return _responder(lista_espera_service.salir, solicitud_id, paciente, db)
