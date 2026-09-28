"""
Endpoints de citas.

HU-16 (Parte 9) + HU-17: al confirmar (POST /citas), se genera el
comprobante automáticamente a continuación -- son dos llamadas a dos
servicios distintos, no una sola lógica mezclada.

GET /citas/{cita_id}/comprobante: HU-17, criterio 4 (consultarlo
después). Requiere el mismo paciente que confirmó la cita.

Bloque 5 — gestionar la cita mientras llega la fecha ("Mis citas"):
GET  /citas                             -> HU-26 / HU-27 / HU-29 (según ?vista=)
GET  /citas/{id}                        -> HU-26 criterio 4 + HU-18 (estado y su historial)
POST /citas/{id}/confirmar-asistencia   -> HU-29 / HU-23
POST /citas/{id}/cancelar               -> HU-21
POST /citas/{id}/reprogramar            -> HU-20

Bloque 6 — el día de la consulta:
POST /citas/{id}/registrar-llegada      -> HU-24
POST /citas/confirmar-asistencia/enlace -> HU-23 (desde el recordatorio)

Todos exigen JWT y solo actúan sobre citas del paciente autenticado,
salvo el enlace del recordatorio, que no pide sesión: su token firmado
solo permite confirmar la asistencia a esa cita.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_paciente
from app.models.cita import Cita
from app.models.paciente import Paciente
from app.repositories import cita_repository
from app.schemas.cita import (
    CancelarCitaRequest,
    CitaOut,
    ComprobanteOut,
    ConfirmacionPorEnlaceOut,
    ConfirmarCitaRequest,
    ConfirmarPorEnlaceRequest,
    MiCitaOut,
    ReprogramarCitaRequest,
)
from app.services import citas_service, comprobante_service
from app.services.exceptions import (
    CitaNoEncontradaError,
    CitaNoModificableError,
    DisponibilidadNoEncontradaError,
    EnlaceInvalidoError,
    FueraDeHorarioDeLlegadaError,
    HorarioYaNoDisponibleError,
    ReprogramacionInvalidaError,
)

router = APIRouter(tags=["Citas"])


def _mi_cita_out(cita: Cita) -> MiCitaOut:
    visible = citas_service.estado_visible(cita)
    activa = citas_service.esta_activa(cita)
    franja = cita.disponibilidad
    llegada_desde, _ = citas_service.ventana_de_llegada(cita)
    return MiCitaOut(
        id=cita.id,
        numero_comprobante=cita.numero_comprobante,
        especialista=franja.especialista,
        sede=franja.sede,
        modalidad=franja.modalidad.value,
        fecha=franja.fecha,
        hora=franja.hora,
        canal_recordatorio=cita.canal_recordatorio.value,
        estado=cita.estado.value,
        estado_visible=visible,
        estado_texto=citas_service.ESTADOS_VISIBLES[visible],
        creado_en=cita.creado_en,
        asistencia_confirmada_en=cita.asistencia_confirmada_en,
        cancelada_en=cita.cancelada_en,
        motivo_cancelacion=cita.motivo_cancelacion,
        recordatorio_enviado_en=cita.recordatorio_enviado_en,
        llegada_registrada_en=cita.llegada_registrada_en,
        cerrada_en=cita.cerrada_en,
        reprogramada_desde=(
            cita.reprogramada_desde.numero_comprobante if cita.reprogramada_desde else None
        ),
        reprogramada_a=cita.reemplazada_por.numero_comprobante if cita.reemplazada_por else None,
        puede_confirmar_asistencia=activa and cita.asistencia_confirmada_en is None,
        puede_cancelar=activa,
        puede_reprogramar=activa,
        puede_registrar_llegada=citas_service.puede_registrar_llegada(cita),
        llegada_disponible_desde=llegada_desde if activa else None,
        historial=citas_service.historial_de_estado(cita),
    )


def _error_http(e: Exception) -> HTTPException:
    codigos = {
        CitaNoEncontradaError: status.HTTP_404_NOT_FOUND,
        DisponibilidadNoEncontradaError: status.HTTP_404_NOT_FOUND,
        CitaNoModificableError: status.HTTP_409_CONFLICT,
        HorarioYaNoDisponibleError: status.HTTP_409_CONFLICT,
        FueraDeHorarioDeLlegadaError: status.HTTP_409_CONFLICT,
        ReprogramacionInvalidaError: status.HTTP_400_BAD_REQUEST,
        EnlaceInvalidoError: status.HTTP_400_BAD_REQUEST,
    }
    return HTTPException(status_code=codigos[type(e)], detail=str(e))


_ERRORES_DE_CITA = (
    CitaNoEncontradaError,
    DisponibilidadNoEncontradaError,
    CitaNoModificableError,
    HorarioYaNoDisponibleError,
    FueraDeHorarioDeLlegadaError,
    ReprogramacionInvalidaError,
    EnlaceInvalidoError,
)


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


@router.get("/citas", response_model=list[MiCitaOut])
def listar_mis_citas(
    vista: Literal["todas", "proximas", "pendientes_confirmar", "historial"] = Query(
        default="todas",
        description=(
            "todas: HU-26 (el frontend las agrupa por estado) · "
            "proximas: HU-27 (citas futuras activas) · "
            "pendientes_confirmar: HU-29 (futuras sin asistencia confirmada) · "
            "historial: HU-28 (anteriores, canceladas y reprogramadas; de la más reciente a la más antigua)"
        ),
    ),
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    # HU-28, criterio 4: siempre y solo las citas del paciente del JWT.
    citas = cita_repository.listar_por_paciente(db, paciente.id)
    if vista == "proximas":
        citas = [c for c in citas if citas_service.estado_visible(c) in citas_service.ESTADOS_ACTIVOS]
    elif vista == "pendientes_confirmar":
        citas = [c for c in citas if citas_service.estado_visible(c) == "pendiente_confirmar"]
    elif vista == "historial":
        # HU-28, criterio 2: organizadas por fecha, lo más reciente primero.
        citas = [c for c in citas if citas_service.es_del_historial(c)][::-1]
    return [_mi_cita_out(c) for c in citas]


@router.get("/citas/{cita_id}", response_model=MiCitaOut)
def obtener_mi_cita(
    cita_id: uuid.UUID,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        cita = citas_service.obtener_del_paciente(db, paciente.id, cita_id)
    except CitaNoEncontradaError as e:
        raise _error_http(e)
    return _mi_cita_out(cita)


@router.post("/citas/{cita_id}/confirmar-asistencia", response_model=MiCitaOut)
def confirmar_asistencia(
    cita_id: uuid.UUID,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        cita = citas_service.confirmar_asistencia(db, paciente.id, cita_id)
    except _ERRORES_DE_CITA as e:
        raise _error_http(e)
    return _mi_cita_out(citas_service.obtener_del_paciente(db, paciente.id, cita.id))


@router.post("/citas/{cita_id}/cancelar", response_model=MiCitaOut)
def cancelar_cita(
    cita_id: uuid.UUID,
    datos: CancelarCitaRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        cita = citas_service.cancelar_cita(db, paciente.id, cita_id, datos.motivo)
    except _ERRORES_DE_CITA as e:
        raise _error_http(e)
    return _mi_cita_out(citas_service.obtener_del_paciente(db, paciente.id, cita.id))


@router.post("/citas/{cita_id}/reprogramar", response_model=MiCitaOut)
def reprogramar_cita(
    cita_id: uuid.UUID,
    datos: ReprogramarCitaRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    """Devuelve la cita NUEVA; la original queda en estado "reprogramada"."""
    try:
        nueva = citas_service.reprogramar_cita(db, paciente.id, cita_id, datos.disponibilidad_id)
    except _ERRORES_DE_CITA as e:
        raise _error_http(e)

    # HU-20, criterio 4 ("confirmar la nueva cita"): la cita nueva recibe
    # su propio comprobante, igual que al agendar (HU-17).
    nueva = comprobante_service.generar_comprobante(db, nueva)
    return _mi_cita_out(citas_service.obtener_del_paciente(db, paciente.id, nueva.id))


@router.post("/citas/{cita_id}/registrar-llegada", response_model=MiCitaOut)
def registrar_llegada(
    cita_id: uuid.UUID,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    """HU-24: el paciente se presenta a su cita (check-in)."""
    try:
        cita = citas_service.registrar_llegada(db, paciente.id, cita_id)
    except _ERRORES_DE_CITA as e:
        raise _error_http(e)
    return _mi_cita_out(citas_service.obtener_del_paciente(db, paciente.id, cita.id))


@router.post("/citas/confirmar-asistencia/enlace", response_model=ConfirmacionPorEnlaceOut)
def confirmar_asistencia_por_enlace(datos: ConfirmarPorEnlaceRequest, db: Session = Depends(get_db)):
    """
    HU-23, criterio 1: el enlace del recordatorio permite confirmar la
    asistencia con un toque, sin iniciar sesión. No usa JWT de sesión:
    el token del enlace solo sirve para esto, para esa cita, y vence
    cuando la cita empieza.
    """
    try:
        cita, ya_estaba = citas_service.confirmar_asistencia_por_enlace(db, datos.token)
    except _ERRORES_DE_CITA as e:
        raise _error_http(e)

    franja = cita.disponibilidad
    return ConfirmacionPorEnlaceOut(
        especialidad=franja.especialista.especialidad.nombre,
        profesional=franja.especialista.nombre,
        sede=franja.sede.nombre,
        modalidad=franja.modalidad.value,
        fecha=franja.fecha,
        hora=franja.hora,
        ya_estaba_confirmada=ya_estaba,
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
