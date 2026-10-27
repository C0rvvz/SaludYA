"""
Pago en línea de una cita atendida (copago o consulta particular), como lo
haría Wompi: SIMULADO, no se cobra nada (integrations/pasarela_pagos).

GET  /citas/{id}/pago                -> qué se paga y cuánto (paso "Revisar")
POST /pagos/tarjetas/token           -> la tarjeta se cambia por un token (no se guarda)
POST /citas/{id}/pagos               -> pagar con el token de la tarjeta o con PSE
GET  /pagos/{referencia}             -> cómo va el pago (PSE: esperando al banco)
POST /pagos/{referencia}/banco       -> lo que responde la persona en su banco (PSE de prueba)
POST /pagos/{referencia}/comprobante -> enviar el comprobante por WhatsApp, correo o mensaje

Todos exigen la sesión del paciente y solo ven sus propios pagos.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_paciente
from app.integrations import pasarela_pagos
from app.models.paciente import Paciente
from app.schemas.pago import (
    DecisionBancoRequest,
    EnviarComprobanteRequest,
    MensajeOut,
    PagarRequest,
    PagoOut,
    ResumenPagoOut,
    TokenTarjetaOut,
    TokenTarjetaRequest,
)
from app.services import pagos_service
from app.services.exceptions import CitaNoEncontradaError, PagoInvalidoError
from app.utils.tiempo import hoy_en_colombia

router = APIRouter(tags=["Pagos"])


def _error_http(e: Exception) -> HTTPException:
    codigo = status.HTTP_404_NOT_FOUND if isinstance(e, CitaNoEncontradaError) else status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=codigo, detail=str(e))


@router.get("/citas/{cita_id}/pago", response_model=ResumenPagoOut)
def resumen_del_pago(
    cita_id: uuid.UUID,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        return pagos_service.resumen(db, paciente, cita_id)
    except CitaNoEncontradaError as e:
        raise _error_http(e)


@router.post("/pagos/tarjetas/token", response_model=TokenTarjetaOut)
def tokenizar_tarjeta(datos: TokenTarjetaRequest, _paciente: Paciente = Depends(get_current_paciente)):
    """Como Wompi: los datos de la tarjeta se cambian por un token de un solo uso."""
    hoy = hoy_en_colombia()
    try:
        return pasarela_pagos.tokenizar_tarjeta(
            datos.numero, datos.cvc, datos.mes, datos.anio, datos.titular, (hoy.year, hoy.month)
        )
    except pasarela_pagos.TarjetaInvalidaError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/citas/{cita_id}/pagos", response_model=PagoOut, status_code=status.HTTP_201_CREATED)
def pagar(
    cita_id: uuid.UUID,
    datos: PagarRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        if datos.metodo == "tarjeta":
            if not datos.token:
                raise PagoInvalidoError("Faltan los datos de la tarjeta.")
            pago = pagos_service.pagar_con_tarjeta(db, paciente, cita_id, datos.token, datos.cuotas)
        else:
            pago = pagos_service.pagar_con_pse(db, paciente, cita_id, datos.banco or "")
    except (CitaNoEncontradaError, PagoInvalidoError) as e:
        raise _error_http(e)
    return pagos_service.datos(pago)


@router.get("/pagos/{referencia}", response_model=PagoOut)
def obtener_pago(referencia: str, paciente: Paciente = Depends(get_current_paciente), db: Session = Depends(get_db)):
    try:
        return pagos_service.datos(pagos_service.obtener(db, paciente, referencia))
    except CitaNoEncontradaError as e:
        raise _error_http(e)


@router.post("/pagos/{referencia}/banco", response_model=PagoOut)
def responder_en_el_banco(
    referencia: str,
    datos: DecisionBancoRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        return pagos_service.datos(pagos_service.decidir_en_banco(db, paciente, referencia, datos.autoriza))
    except CitaNoEncontradaError as e:
        raise _error_http(e)


@router.post("/pagos/{referencia}/comprobante", response_model=MensajeOut)
def enviar_comprobante(
    referencia: str,
    datos: EnviarComprobanteRequest,
    paciente: Paciente = Depends(get_current_paciente),
    db: Session = Depends(get_db),
):
    try:
        return {"mensaje": pagos_service.enviar_comprobante(db, paciente, referencia, datos.canal)}
    except (CitaNoEncontradaError, PagoInvalidoError) as e:
        raise _error_http(e)
