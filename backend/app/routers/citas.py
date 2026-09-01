"""
Endpoints de citas.

HU-16 (Parte 9) + HU-17 (esta parte): al confirmar (POST /citas), se
genera el comprobante automáticamente a continuación -- son dos
llamadas a dos servicios distintos, no una sola lógica mezclada.

GET /citas/{cita_id}/comprobante: HU-17, criterio 4 (consultarlo
después). Requiere el mismo paciente que confirmó la cita.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_paciente
from app.models.paciente import Paciente
from app.schemas.cita import CitaOut, ComprobanteOut, ConfirmarCitaRequest
from app.services import citas_service, comprobante_service
from app.services.exceptions import (
    CitaNoEncontradaError,
    DisponibilidadNoEncontradaError,
    HorarioYaNoDisponibleError,
)

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

    # --- HU-17: generar el comprobante justo después de confirmar ---
    cita = comprobante_service.generar_comprobante(db, cita)

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
        numero_comprobante=cita.numero_comprobante,
        comprobante_generado_en=cita.comprobante_generado_en,
        mensaje="Tu cita quedó confirmada y el comprobante fue generado.",
    )


@router.get("/citas/{cita_id}/comprobante", response_model=ComprobanteOut)
def obtener_comprobante(
    cita_id: uuid.UUID,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        cita = comprobante_service.obtener_comprobante(db, paciente.id, cita_id)
    except CitaNoEncontradaError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return ComprobanteOut(
        numero_comprobante=cita.numero_comprobante,
        paciente_nombre=cita.paciente.nombre,
        especialidad=cita.disponibilidad.especialista.especialidad.nombre,
        profesional=cita.disponibilidad.especialista.nombre,
        sede=cita.disponibilidad.sede.nombre,
        modalidad=cita.disponibilidad.modalidad.value,
        fecha=cita.disponibilidad.fecha,
        hora=cita.disponibilidad.hora,
        estado=cita.estado.value,
        canal_envio=cita.canal_envio_comprobante.value,
        generado_en=cita.comprobante_generado_en,
    )
