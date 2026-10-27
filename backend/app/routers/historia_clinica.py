"""
Personal › Historia clínica: diagnósticos y fórmulas (acceso restringido).

GET  /admin/historia-clinica                         pacientes atendidos (búsqueda, filtros, páginas)
GET  /admin/historia-clinica/{cita_id}               una consulta: diagnóstico, fórmula, entrega y accesos
PUT  /admin/historia-clinica/{cita_id}/formula       registrar o corregir la fórmula
POST /admin/historia-clinica/{cita_id}/reenviar-codigo  volver a mandarle al paciente el código

Todos exigen el permiso historia_clinica (Médico y Coordinación médica);
el médico, además, solo sus pacientes (historia_clinica_service). Un
intento sin permiso queda en los eventos de seguridad.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere
from app.core.permisos import Permiso
from app.models.personal import Personal
from app.schemas.formula import FormulaRequest
from app.schemas.historia_clinica import HistoriaDetalleOut, ListadoHistoriaOut, ReenvioOut
from app.services import historia_clinica_service, seguridad_service
from app.services.exceptions import CitaNoEncontradaError, FormulaInvalidaError, HistoriaClinicaRestringidaError

router = APIRouter(prefix="/admin/historia-clinica", tags=["Historia clínica"])

PERIODOS = {"7": 7, "30": 30, "90": 90, "365": 365, "todo": None}


def _http(e: Exception, request: Request, db: Session, personal: Personal) -> HTTPException:
    if isinstance(e, HistoriaClinicaRestringidaError):
        seguridad_service.registrar(
            db, "acceso_denegado", seguridad_service.MEDIA, "personal",
            "Intentó ver la historia clínica de alguien que no es su paciente", request=request,
            sujeto_id=personal.id, sujeto_nombre=seguridad_service.nombre_personal(personal),
            identificador=personal.correo, detalle=f"{request.method} {request.url.path}",
        )
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    codigo = status.HTTP_404_NOT_FOUND if isinstance(e, CitaNoEncontradaError) else status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=codigo, detail=str(e))


_ERRORES = (CitaNoEncontradaError, FormulaInvalidaError, HistoriaClinicaRestringidaError)


@router.get("", response_model=ListadoHistoriaOut)
def listar(
    buscar: str | None = Query(default=None, max_length=100, description="Nombre o documento"),
    especialidad_id: uuid.UUID | None = None,
    eps: str | None = Query(default=None, max_length=40, description="Id de la EPS o 'particular'"),
    periodo: Literal["7", "30", "90", "365", "todo"] = "30",
    pagina: int = Query(default=1, ge=1),
    personal: Personal = Depends(requiere(Permiso.HISTORIA_CLINICA)),
    db: Session = Depends(get_db),
):
    return historia_clinica_service.listar(db, personal, buscar, especialidad_id, eps, PERIODOS[periodo], pagina)


@router.get("/{cita_id}", response_model=HistoriaDetalleOut)
def detalle(
    cita_id: uuid.UUID,
    request: Request,
    personal: Personal = Depends(requiere(Permiso.HISTORIA_CLINICA)),
    db: Session = Depends(get_db),
):
    """Cada consulta queda en la auditoría."""
    try:
        return historia_clinica_service.detalle(db, personal, cita_id)
    except _ERRORES as e:
        raise _http(e, request, db, personal)


@router.put("/{cita_id}/formula", response_model=HistoriaDetalleOut)
def registrar_formula(
    cita_id: uuid.UUID,
    datos: FormulaRequest,
    request: Request,
    personal: Personal = Depends(requiere(Permiso.HISTORIA_CLINICA)),
    db: Session = Depends(get_db),
):
    """Registrar o corregir lo que formuló el médico; la primera vez se le avisa al paciente."""
    try:
        return historia_clinica_service.registrar_formula(db, personal, cita_id, {
            "diagnostico": datos.diagnostico,
            "cie10": datos.cie10,
            "nota": datos.nota,
            "medicamentos": [m.model_dump() for m in datos.medicamentos],
            "recomendaciones": datos.recomendaciones,
            "cubierta_por_eps": datos.cubierta_por_eps,
        })
    except _ERRORES as e:
        raise _http(e, request, db, personal)


@router.post("/{cita_id}/reenviar-codigo", response_model=ReenvioOut)
def reenviar_codigo(
    cita_id: uuid.UUID,
    request: Request,
    personal: Personal = Depends(requiere(Permiso.HISTORIA_CLINICA)),
    db: Session = Depends(get_db),
):
    try:
        return {"canal": historia_clinica_service.reenviar_codigo(db, personal, cita_id)}
    except _ERRORES as e:
        raise _http(e, request, db, personal)
