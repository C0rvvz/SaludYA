"""
Pagar en línea una cita ya atendida (el copago o la consulta particular),
para no hacer fila en la sede. Ver models/pago.py e integrations/pasarela_pagos.py.

- Solo el paciente de la cita, solo si ya fue atendida, si tiene valor y si
  no está pagada.
- Tarjeta: se responde de una vez (aprobado o rechazado).
- PSE: queda pendiente hasta que la persona responda en su banco
  (decidir_en_banco). Si empieza otro intento, el pendiente se descarta.
- Aprobado: código de llegada de 4 números (con su QR) para la máquina de
  la EPS, y el comprobante se envía por el canal que elija.
"""

import secrets
import uuid
from datetime import datetime, timezone

import segno
from sqlalchemy.orm import Session

from app.integrations import pasarela_pagos
from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import CanalContacto, Cita, EstadoCita
from app.models.pago import APROBADO, PENDIENTE, RECHAZADO, Pago
from app.models.paciente import Paciente
from app.repositories import cita_repository
from app.services import auditoria_service, citas_service
from app.services.auditoria_service import Actor
from app.services.exceptions import CitaNoEncontradaError, PagoInvalidoError
from app.utils.tiempo import fecha_legible, hoy_en_colombia

CONCEPTO = {"eps": "Copago EPS", "aliada": "Copago EPS aliada", "particular": "Consulta particular"}


def pago_aprobado(cita: Cita) -> Pago | None:
    return next((p for p in cita.pagos if p.estado == APROBADO), None)


def esta_pendiente(cita: Cita) -> bool:
    """Ya la atendieron, tiene valor y todavía no está pagada."""
    return cita.estado == EstadoCita.ATENDIDA and cita.valor > 0 and pago_aprobado(cita) is None


def concepto(cita: Cita) -> str:
    texto = CONCEPTO.get(cita.tipo_cobro, "Consulta")
    if cita.tipo_cobro == "eps" and cita.paciente.eps:
        return f"{texto} {cita.paciente.eps.nombre}"
    if cita.tipo_cobro == "aliada":
        eps = cita.disponibilidad.especialista.eps
        return f"{texto} ({eps.nombre})" if eps else texto
    return texto


def _por_pagar(db: Session, paciente: Paciente, cita_id: uuid.UUID) -> Cita:
    # Bloquea la cita hasta el commit: dos pagos a la vez no la cobran dos veces.
    cita_repository.obtener_con_lock(db, cita_id)
    cita = citas_service.obtener_del_paciente(db, paciente.id, cita_id)
    if cita.valor <= 0:
        raise PagoInvalidoError("Esta cita no tiene nada que pagar.")
    if pago_aprobado(cita) is not None:
        raise PagoInvalidoError("Esta cita ya está pagada.")
    if cita.estado != EstadoCita.ATENDIDA:
        raise PagoInvalidoError("La cita se paga después de que lo atiendan.")
    return cita


def _referencia(db: Session) -> str:
    while True:
        referencia = f"PAG-{hoy_en_colombia().year}-{secrets.randbelow(100_000):05d}"
        if not db.query(Pago.id).filter(Pago.referencia == referencia).first():
            return referencia


def _descartar_pendientes(cita: Cita, ahora: datetime) -> None:
    for p in cita.pagos:
        if p.estado == PENDIENTE:
            p.estado, p.motivo, p.actualizado_en = RECHAZADO, "Se empezó otro pago.", ahora


def _cerrar(db: Session, pago: Pago, aprobado: bool, motivo: str | None, paciente: Paciente) -> None:
    pago.estado = APROBADO if aprobado else RECHAZADO
    pago.motivo = None if aprobado else motivo
    pago.actualizado_en = datetime.now(timezone.utc)
    if aprobado:
        pago.codigo_llegada = f"{secrets.randbelow(10_000):04d}"
    auditoria_service.registrar(
        db, Actor.de_paciente(paciente), "pagar_cita" if aprobado else "pago_rechazado",
        f"{'Pagó' if aprobado else 'No se aprobó el pago de'} ${pago.valor:,} ({pago.detalle})".replace(",", "."),
        cita=pago.cita, detalle=None if aprobado else motivo,
    )


def pagar_con_tarjeta(db: Session, paciente: Paciente, cita_id: uuid.UUID, token: str, cuotas: int) -> Pago:
    cita = _por_pagar(db, paciente, cita_id)
    try:
        resultado = pasarela_pagos.cobrar_con_tarjeta(token, cuotas)
    except pasarela_pagos.TarjetaInvalidaError as e:
        raise PagoInvalidoError(str(e))
    ahora = datetime.now(timezone.utc)
    _descartar_pendientes(cita, ahora)
    pago = Pago(cita=cita, referencia=_referencia(db), metodo="tarjeta", valor=cita.valor,
                detalle=resultado.detalle, transaccion=resultado.transaccion, creado_en=ahora, actualizado_en=ahora)
    db.add(pago)
    db.flush()
    _cerrar(db, pago, resultado.aprobado, resultado.motivo, paciente)
    db.commit()
    db.refresh(pago)
    return pago


def pagar_con_pse(db: Session, paciente: Paciente, cita_id: uuid.UUID, banco: str) -> Pago:
    """Queda pendiente: la persona sigue en la página de su banco (decidir_en_banco)."""
    cita = _por_pagar(db, paciente, cita_id)
    try:
        resultado = pasarela_pagos.iniciar_pse(banco)
    except pasarela_pagos.TarjetaInvalidaError as e:
        raise PagoInvalidoError(str(e))
    ahora = datetime.now(timezone.utc)
    _descartar_pendientes(cita, ahora)
    pago = Pago(cita=cita, referencia=_referencia(db), metodo="pse", valor=cita.valor, detalle=resultado.detalle,
                transaccion=resultado.transaccion, creado_en=ahora, actualizado_en=ahora)
    db.add(pago)
    db.commit()
    db.refresh(pago)
    return pago


def obtener(db: Session, paciente: Paciente, referencia: str, bloquear: bool = False) -> Pago:
    consulta = db.query(Pago).filter(Pago.referencia == referencia)
    pago = (consulta.with_for_update() if bloquear else consulta).first()
    if pago is None or pago.cita.paciente_id != paciente.id:
        raise CitaNoEncontradaError("No encontramos ese pago.")
    return pago


def decidir_en_banco(db: Session, paciente: Paciente, referencia: str, autoriza: bool) -> Pago:
    """Lo que la persona responde en la página de su banco (PSE)."""
    pago = obtener(db, paciente, referencia, bloquear=True)
    if pago.estado != PENDIENTE:
        return pago  # ya se había respondido (p. ej. volvió atrás en el navegador)
    _cerrar(db, pago, autoriza, None if autoriza else "Canceló el pago en la página de su banco.", paciente)
    db.commit()
    db.refresh(pago)
    return pago


def qr_llegada(pago: Pago) -> str | None:
    if pago.codigo_llegada is None:
        return None
    contenido = f"SALUDYA-LLEGADA|{pago.referencia}|{pago.codigo_llegada}"
    return segno.make(contenido, error="m").svg_data_uri(scale=4, dark="#0e1f39", border=2)


def enviar_comprobante(db: Session, paciente: Paciente, referencia: str, canal: CanalContacto) -> str:
    pago = obtener(db, paciente, referencia)
    if pago.estado != APROBADO:
        raise PagoInvalidoError("Solo se envía el comprobante de un pago aprobado.")
    if canal == CanalContacto.CORREO and not paciente.correo:
        raise PagoInvalidoError("Su cuenta no tiene correo. Elija WhatsApp o mensaje de texto.")
    franja = pago.cita.disponibilidad
    mensaje = (
        f"SaludYA: recibimos su pago de ${pago.valor:,} por la cita de "
        f"{franja.especialista.especialidad.nombre} del {fecha_legible(franja.fecha)}. "
        f"Referencia {pago.referencia}. Código de llegada: {pago.codigo_llegada}."
    ).replace(",", ".")
    if not enviar_por_canal(paciente, canal, mensaje):
        raise PagoInvalidoError("No pudimos enviar el comprobante. Intente de nuevo en unos segundos.")
    return {
        CanalContacto.WHATSAPP: "Le enviamos el comprobante a su WhatsApp.",
        CanalContacto.CORREO: "Le enviamos el comprobante a su correo.",
        CanalContacto.SMS: "Le enviamos el comprobante por mensaje de texto.",
    }.get(canal, "Le enviamos el comprobante.")


def datos(pago: Pago) -> dict:
    franja = pago.cita.disponibilidad
    return {
        "referencia": pago.referencia,
        "cita_id": pago.cita_id,
        "metodo": pago.metodo,
        "estado": pago.estado,
        "valor": pago.valor,
        "detalle": pago.detalle,
        "motivo": pago.motivo,
        "fecha": pago.actualizado_en,
        "codigo_llegada": pago.codigo_llegada,
        "qr_llegada": qr_llegada(pago),
        "especialidad": franja.especialista.especialidad.nombre,
        "especialista": franja.especialista.nombre,
        "fecha_cita": franja.fecha,
    }


def resumen(db: Session, paciente: Paciente, cita_id: uuid.UUID) -> dict:
    """Paso "Revisar": qué se paga y cuánto (o el pago que ya tiene)."""
    cita = citas_service.obtener_del_paciente(db, paciente.id, cita_id)
    franja = cita.disponibilidad
    aprobado = pago_aprobado(cita)
    return {
        "cita_id": cita.id,
        "especialidad": franja.especialista.especialidad.nombre,
        "especialista": franja.especialista.nombre,
        "sede": franja.sede.nombre,
        "fecha": franja.fecha,
        "concepto": concepto(cita),
        "valor": cita.valor,
        "pendiente": esta_pendiente(cita),
        "pago": datos(aprobado) if aprobado else None,
        "bancos": pasarela_pagos.BANCOS_PSE,
        "correo": paciente.correo,
    }
