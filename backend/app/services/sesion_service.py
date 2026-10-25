"""
Sesiones del servidor — RNF-17 (HU-91) y RNF-24 (HU-93).

- abrir(): al iniciar sesión cierra las demás sesiones abiertas de esa
  persona (una sola sesión a la vez: la nueva gana) y crea la nueva. El
  ingreso, y la sesión que reemplazó, quedan en los eventos de seguridad.
- validar(): en cada petición, la sesión del token debe seguir abierta y
  haber tenido actividad hace menos de SESION_INACTIVIDAD_MINUTOS; si no,
  se cierra y se rechaza la petición con el motivo.
- cerrar() / cerrar_todas(): al salir, o al modificar la cuenta.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.sesion import MotivoCierre, Sesion
from app.services import seguridad_service
from app.services.exceptions import SesionCerradaError

# Mensajes que ve la persona al volver a la pantalla de ingreso.
MENSAJES_CIERRE = {
    MotivoCierre.OTRA_SESION: "Su sesión se cerró porque se inició sesión con su cuenta en otra pestaña o dispositivo.",
    MotivoCierre.INACTIVIDAD: "Su sesión se cerró por seguridad después de 2 minutos sin actividad. Ingrese de nuevo.",
    MotivoCierre.SALIO: "Su sesión ya fue cerrada. Ingrese de nuevo.",
    MotivoCierre.CUENTA_MODIFICADA: "Su cuenta fue modificada por un administrador. Ingrese de nuevo.",
    MotivoCierre.CERRADA_POR_ADMIN: "Un administrador cerró su sesión por seguridad. Ingrese de nuevo.",
}

# La última actividad se guarda como mucho cada tantos segundos: así no se
# escribe en la base de datos en cada petición.
_ACTUALIZAR_CADA = timedelta(seconds=5)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _abiertas(db: Session, tipo: str, sujeto_id: uuid.UUID):
    return db.query(Sesion).filter(Sesion.tipo == tipo, Sesion.sujeto_id == sujeto_id, Sesion.cerrada_en.is_(None))


def _cerrar(sesion: Sesion, motivo: MotivoCierre, cuando: datetime) -> None:
    sesion.cerrada_en = cuando
    sesion.motivo_cierre = motivo.value


def abrir(
    db: Session,
    tipo: str,
    sujeto_id: uuid.UUID,
    ip: str | None,
    dispositivo: str | None,
) -> Sesion:
    ahora = _ahora()
    en_uso = []  # las que seguían con actividad: las abandonadas no cuentan como "otra sesión"
    for anterior in _abiertas(db, tipo, sujeto_id).with_for_update():
        if ahora - anterior.ultima_actividad_en <= timedelta(minutes=settings.sesion_inactividad_minutos):
            en_uso.append(anterior)
        _cerrar(anterior, MotivoCierre.OTRA_SESION, ahora)
    sesion = Sesion(
        tipo=tipo,
        sujeto_id=sujeto_id,
        creada_en=ahora,
        ultima_actividad_en=ahora,
        ip=ip,
        dispositivo=(dispositivo or "")[:200] or None,
    )
    db.add(sesion)
    db.commit()
    db.refresh(sesion)

    nombre, identificador = seguridad_service.quien_es(db, tipo, sujeto_id)
    quien = {"ip": ip, "sujeto_id": sujeto_id, "sujeto_nombre": nombre, "identificador": identificador,
             "dispositivo": dispositivo}
    donde = "al panel del personal" if tipo == "personal" else "al portal del paciente"
    seguridad_service.registrar(db, "ingreso_exitoso", seguridad_service.INFO, tipo, f"Ingresó {donde}", **quien)
    for anterior in en_uso:
        otra_conexion = anterior.ip != ip
        seguridad_service.registrar(
            db, "sesion_reemplazada", seguridad_service.MEDIA if otra_conexion else seguridad_service.INFO, tipo,
            "Ingresó en otra pestaña o equipo y se cerró su sesión anterior",
            detalle=f"Sesión anterior desde {anterior.ip or 'una conexión desconocida'}", **quien,
        )
    return sesion


def validar(db: Session, sid: uuid.UUID, tipo: str, sujeto_id: uuid.UUID) -> Sesion:
    """La sesión del token, ya con su actividad al día. Si no sirve, lanza SesionCerradaError."""
    sesion = db.get(Sesion, sid)
    if sesion is None or sesion.tipo != tipo or sesion.sujeto_id != sujeto_id:
        raise SesionCerradaError("Su sesión no es válida. Ingrese de nuevo.")
    if sesion.cerrada_en is not None:
        raise SesionCerradaError(MENSAJES_CIERRE.get(MotivoCierre(sesion.motivo_cierre), MENSAJES_CIERRE[MotivoCierre.SALIO]))

    ahora = _ahora()
    if ahora - sesion.ultima_actividad_en > timedelta(minutes=settings.sesion_inactividad_minutos):
        _cerrar(sesion, MotivoCierre.INACTIVIDAD, ahora)
        db.commit()
        raise SesionCerradaError(MENSAJES_CIERRE[MotivoCierre.INACTIVIDAD])

    if ahora - sesion.ultima_actividad_en > _ACTUALIZAR_CADA:
        sesion.ultima_actividad_en = ahora
        db.commit()
    return sesion


def cerrar(db: Session, sid: uuid.UUID, motivo: MotivoCierre = MotivoCierre.SALIO) -> None:
    sesion = db.get(Sesion, sid)
    if sesion is not None and sesion.cerrada_en is None:
        _cerrar(sesion, motivo, _ahora())
        db.commit()


def cerrar_todas(db: Session, tipo: str, sujeto_id: uuid.UUID, motivo: MotivoCierre) -> int:
    """Sin commit: se guarda junto con el cambio que la provocó (p. ej. desactivar la cuenta)."""
    ahora = _ahora()
    abiertas = _abiertas(db, tipo, sujeto_id).all()
    for sesion in abiertas:
        _cerrar(sesion, motivo, ahora)
    return len(abiertas)
