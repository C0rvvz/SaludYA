"""
Servicio de citas del paciente.

HU-16 (confirmar cita): confirmar_cita.
HU-15 (seleccionar fecha/hora) ya queda resuelta por los endpoints de
disponibilidad de las Partes 7 y 8 (criterios 1-3: ahí se muestran
fechas/horarios disponibles y nunca uno ocupado). El criterio 4 de
HU-15 ("la fecha/hora deben guardarse para la cita") se cumple
exactamente aquí: el disponibilidad_id que el paciente eligió es lo
que esta función persiste como parte de la cita.

Bloque 5 — gestionar la cita mientras llega la fecha:
- HU-29 / HU-23: confirmar_asistencia.
- HU-21: cancelar_cita (libera el cupo).
- HU-20: reprogramar_cita (reserva el horario nuevo y libera el anterior
  en una sola transacción).
- HU-18: estado_visible / historial_de_estado.

Bloque 6 — el día de la consulta:
- HU-23: confirmar_asistencia_por_enlace (desde el recordatorio, sin
  iniciar sesión).
- HU-24: registrar_llegada (check-in dentro de la ventana de la cita).
- HU-25: cerrar_citas_pasadas (atendida / no asistió).

Todas las acciones del paciente reciben el paciente autenticado y
verifican que la cita sea suya: nunca se actúa sobre una cita solo por
conocer su id. La única excepción es el enlace del recordatorio, que ya
es una autorización firmada para esa cita y esa acción.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    crear_token_confirmacion_asistencia,
    leer_token_confirmacion_asistencia,
)
from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import CanalContacto, Cita, EstadoCita
from app.models.disponibilidad import Disponibilidad, EstadoDisponibilidad
from app.repositories import cita_repository, disponibilidad_repository
from app.services.exceptions import (
    CitaNoEncontradaError,
    CitaNoModificableError,
    DisponibilidadNoEncontradaError,
    EnlaceInvalidoError,
    FueraDeHorarioDeLlegadaError,
    HorarioYaNoDisponibleError,
    ReprogramacionInvalidaError,
)
from app.utils.tiempo import ZONA_COLOMBIA, ahora_colombia, fecha_legible, hora_legible

# HU-18, criterio 4: el estado debe mostrarse de manera clara.
ESTADOS_VISIBLES = {
    "pendiente_confirmar": "Pendiente de confirmar asistencia",
    "asistencia_confirmada": "Asistencia confirmada",
    "llegada_registrada": "Llegada registrada",
    "finalizada": "En espera de registro de atención",
    "atendida": "Atendida",
    "no_asistio": "No asistió",
    "cancelada": "Cancelada",
    "reprogramada": "Reprogramada",
}

# Citas que todavía van a ocurrir (o están ocurriendo); el resto forma
# el historial del paciente (HU-28).
ESTADOS_ACTIVOS = {"pendiente_confirmar", "asistencia_confirmada", "llegada_registrada"}


def es_del_historial(cita: Cita) -> bool:
    """HU-28: citas anteriores, atendidas o no, incluidas las canceladas y reprogramadas."""
    return estado_visible(cita) not in ESTADOS_ACTIVOS


def _ahora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _inicio(disponibilidad: Disponibilidad) -> datetime:
    return datetime.combine(disponibilidad.fecha, disponibilidad.hora)


def inicio_de(cita: Cita) -> datetime:
    """Fecha y hora de la cita, hora de Colombia (sin zona)."""
    return _inicio(cita.disponibilidad)


def es_futura(cita: Cita) -> bool:
    return inicio_de(cita) > ahora_colombia()


def esta_activa(cita: Cita) -> bool:
    """
    Se puede confirmar, cancelar o reprogramar: vigente, todavía no
    ocurre y el paciente no ha llegado a la sede (tras registrar la
    llegada ya no tiene sentido cancelarla ni moverla).
    """
    return (
        cita.estado == EstadoCita.CONFIRMADA
        and es_futura(cita)
        and cita.llegada_registrada_en is None
    )


def ventana_de_llegada(cita: Cita) -> tuple[datetime, datetime]:
    """HU-24, criterio 3: la llegada solo se registra cerca de la fecha y hora de la cita."""
    inicio = inicio_de(cita)
    return (
        inicio - timedelta(minutes=settings.llegada_minutos_antes),
        inicio + timedelta(minutes=settings.llegada_minutos_despues),
    )


def puede_registrar_llegada(cita: Cita) -> bool:
    desde, hasta = ventana_de_llegada(cita)
    return (
        cita.estado == EstadoCita.CONFIRMADA
        and cita.llegada_registrada_en is None
        and desde <= ahora_colombia() <= hasta
    )


def estado_visible(cita: Cita) -> str:
    """Estado como lo entiende el paciente (clave de ESTADOS_VISIBLES)."""
    if cita.estado == EstadoCita.CANCELADA:
        return "cancelada"
    if cita.estado == EstadoCita.REPROGRAMADA:
        return "reprogramada"
    if cita.estado == EstadoCita.ATENDIDA:
        return "atendida"
    if cita.estado == EstadoCita.NO_ASISTIO:
        return "no_asistio"
    if cita.llegada_registrada_en:
        return "llegada_registrada"
    if not es_futura(cita):
        # Ya empezó y todavía no se cierra (ver cerrar_citas_pasadas).
        return "finalizada"
    return "asistencia_confirmada" if cita.asistencia_confirmada_en else "pendiente_confirmar"


def historial_de_estado(cita: Cita) -> list[dict]:
    """
    HU-18: línea de tiempo del estado de la cita, de lo más antiguo a lo
    más reciente. Se arma a partir de las fechas que se guardan en cada
    cambio, así que siempre refleja el estado actual (criterio 2).
    """
    eventos = []
    if cita.reprogramada_desde is not None:
        eventos.append(
            ("agendada", cita.creado_en,
             f"Cita agendada al reprogramar la cita {cita.reprogramada_desde.numero_comprobante}")
        )
    else:
        eventos.append(("agendada", cita.creado_en, "Cita agendada"))
    if cita.recordatorio_enviado_en:
        eventos.append(("recordatorio", cita.recordatorio_enviado_en, "Recordatorio enviado"))
    if cita.asistencia_confirmada_en:
        eventos.append(("asistencia_confirmada", cita.asistencia_confirmada_en, "Asistencia confirmada"))
    if cita.llegada_registrada_en:
        eventos.append(("llegada", cita.llegada_registrada_en, "Llegada registrada"))
    if cita.cerrada_en:
        if cita.estado == EstadoCita.ATENDIDA:
            eventos.append(("atendida", cita.cerrada_en, "Atención registrada"))
        else:
            eventos.append(("no_asistio", cita.cerrada_en, "Se registró que no asistió"))
    if cita.cancelada_en:
        detalle = f": {cita.motivo_cancelacion}" if cita.motivo_cancelacion else ""
        eventos.append(("cancelada", cita.cancelada_en, f"Cita cancelada{detalle}"))
    if cita.reprogramada_en:
        nueva = cita.reemplazada_por
        destino = f" a la cita {nueva.numero_comprobante}" if nueva is not None else ""
        eventos.append(("reprogramada", cita.reprogramada_en, f"Cita reprogramada{destino}"))
    eventos.sort(key=lambda e: e[1])
    return [{"tipo": t, "fecha": f, "descripcion": d} for t, f, d in eventos]


def _por_que_no_se_puede(cita: Cita) -> str:
    if cita.estado == EstadoCita.CANCELADA:
        return "Esta cita ya fue cancelada."
    if cita.estado == EstadoCita.REPROGRAMADA:
        return "Esta cita ya fue reprogramada. Use la cita nueva."
    if cita.llegada_registrada_en:
        return "Usted ya registró su llegada a esta cita."
    return "Esta cita ya pasó."


def _del_paciente_con_lock(db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID) -> Cita:
    # Con bloqueo de fila: si llegan dos acciones sobre la misma cita a
    # la vez (p. ej., cancelar y reprogramar), la segunda espera y vuelve
    # a validar el estado ya actualizado.
    cita = cita_repository.obtener_con_lock(db, cita_id)
    # Mismo error si no existe o si es de otro paciente (ver CitaNoEncontradaError).
    if cita is None or cita.paciente_id != paciente_id:
        raise CitaNoEncontradaError("No encontramos esa cita entre sus citas.")
    return cita


def obtener_del_paciente(db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID) -> Cita:
    cita = cita_repository.obtener_por_id(db, cita_id)
    if cita is None or cita.paciente_id != paciente_id:
        raise CitaNoEncontradaError("No encontramos esa cita entre sus citas.")
    return cita


def confirmar_cita(
    db: Session,
    paciente_id: uuid.UUID,
    disponibilidad_id: uuid.UUID,
    canal_recordatorio: CanalContacto,
) -> Cita:
    # --- HU-16, criterio 3: comprobar que el horario SIGA disponible ---
    # con bloqueo de fila, para que dos pacientes no puedan confirmar el
    # mismo horario si llegan casi al mismo tiempo.
    disponibilidad = disponibilidad_repository.obtener_con_lock(db, disponibilidad_id)

    if disponibilidad is None:
        raise DisponibilidadNoEncontradaError(
            f"No existe ninguna disponibilidad con id {disponibilidad_id}."
        )

    if disponibilidad.estado != EstadoDisponibilidad.DISPONIBLE:
        raise HorarioYaNoDisponibleError(
            "Ese horario ya no está disponible. Por favor elige otro."
        )

    if _inicio(disponibilidad) <= ahora_colombia():
        raise HorarioYaNoDisponibleError("Ese horario ya pasó. Por favor elige otro.")

    disponibilidad.estado = EstadoDisponibilidad.RESERVADO

    # --- HU-16, criterio 4: registrar definitivamente la cita ---
    cita = Cita(
        paciente_id=paciente_id,
        disponibilidad_id=disponibilidad.id,
        canal_recordatorio=canal_recordatorio,
        estado=EstadoCita.CONFIRMADA,
        creado_en=_ahora_utc(),
    )
    db.add(cita)

    try:
        db.commit()
    except IntegrityError:
        # Red de seguridad adicional: si dos confirmaciones llegaran
        # exactamente al mismo tiempo pese al bloqueo de fila, el índice
        # único de citas activas por franja rechaza la segunda.
        db.rollback()
        raise HorarioYaNoDisponibleError(
            "Ese horario ya no está disponible. Por favor elige otro."
        )

    db.refresh(cita)
    return cita


def confirmar_asistencia(db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID) -> Cita:
    """HU-29 / HU-23: el paciente confirma que asistirá."""
    cita = _del_paciente_con_lock(db, paciente_id, cita_id)
    if not esta_activa(cita):
        db.rollback()
        raise CitaNoModificableError(_por_que_no_se_puede(cita))

    # Confirmar dos veces no es un error: queda la primera fecha.
    if cita.asistencia_confirmada_en is None:
        cita.asistencia_confirmada_en = _ahora_utc()
    db.commit()
    db.refresh(cita)
    return cita


def token_de_confirmacion(cita: Cita) -> str:
    """HU-23, criterio 1: enlace del recordatorio. Vence cuando empieza la cita."""
    vence = inicio_de(cita).replace(tzinfo=ZONA_COLOMBIA)
    return crear_token_confirmacion_asistencia(cita.id, vence)


def confirmar_asistencia_por_enlace(db: Session, token: str) -> tuple[Cita, bool]:
    """
    HU-23: confirmar desde el enlace del recordatorio, sin iniciar
    sesión (criterio 2: "fácilmente"). El token firmado ya es la
    autorización: solo sirve para esta acción sobre esta cita.
    Devuelve (cita, ya_estaba_confirmada).
    """
    try:
        cita_id = leer_token_confirmacion_asistencia(token)
    except jwt.ExpiredSignatureError:
        raise EnlaceInvalidoError("Este enlace ya venció: la cita ya empezó o ya pasó.")
    except jwt.InvalidTokenError:
        raise EnlaceInvalidoError("Este enlace no es válido.")

    cita = cita_repository.obtener_con_lock(db, cita_id)
    if cita is None:
        raise EnlaceInvalidoError("Este enlace no es válido.")
    if cita.asistencia_confirmada_en is not None:
        db.rollback()
        return cita, True
    if not esta_activa(cita):
        db.rollback()
        raise CitaNoModificableError(_por_que_no_se_puede(cita))

    cita.asistencia_confirmada_en = _ahora_utc()
    db.commit()
    db.refresh(cita)
    return cita, False


def registrar_llegada(db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID) -> Cita:
    """
    HU-24: el paciente se presenta a su cita (check-in).
    Criterio 1: la cita debe estar vigente. Criterio 3: solo dentro de la
    ventana de la fecha y hora de la cita. Criterio 4: queda registrada.
    Registrar la llegada también cuenta como asistencia confirmada.
    """
    cita = _del_paciente_con_lock(db, paciente_id, cita_id)
    if cita.estado != EstadoCita.CONFIRMADA:
        db.rollback()
        raise CitaNoModificableError(_por_que_no_se_puede(cita))
    if cita.llegada_registrada_en is not None:
        # Registrar dos veces no es un error: queda la primera hora.
        db.rollback()
        return cita

    desde, hasta = ventana_de_llegada(cita)
    ahora = ahora_colombia()
    if ahora < desde:
        db.rollback()
        raise FueraDeHorarioDeLlegadaError(
            f"Todavía es temprano. Podrá registrar su llegada desde las {hora_legible(desde.time())}"
            f" del {fecha_legible(desde.date())}."
        )
    if ahora > hasta:
        db.rollback()
        raise FueraDeHorarioDeLlegadaError(
            "El tiempo para registrar su llegada a esta cita ya pasó. "
            "Si está en la sede, acérquese a recepción."
        )

    ahora_utc = _ahora_utc()
    cita.llegada_registrada_en = ahora_utc
    if cita.asistencia_confirmada_en is None:
        cita.asistencia_confirmada_en = ahora_utc
    db.commit()
    db.refresh(cita)
    return cita


def cerrar_citas_pasadas(db: Session) -> tuple[int, int]:
    """
    HU-25: registra el resultado de las citas que ya ocurrieron.

    SUPUESTO (mientras no exista el módulo del personal, HU-43): la cita
    se cierra CIERRE_MINUTOS_DESPUES tras su inicio, como "atendida" si
    el paciente registró su llegada, o "no asistió" si no. Criterio 3
    ("la atención debe quedar registrada") y criterio 4 ("el estado de
    la cita debe actualizarse después de la consulta").

    Devuelve (atendidas, no_asistio).
    """
    limite = ahora_colombia() - timedelta(minutes=settings.cierre_minutos_despues)
    atendidas = inasistencias = 0
    for cita in cita_repository.por_cerrar(db, hasta_fecha=limite.date()):
        if inicio_de(cita) > limite:
            continue
        cita.cerrada_en = _ahora_utc()
        if cita.llegada_registrada_en is not None:
            cita.estado = EstadoCita.ATENDIDA
            atendidas += 1
        else:
            cita.estado = EstadoCita.NO_ASISTIO
            inasistencias += 1
    db.commit()
    return atendidas, inasistencias


def cancelar_cita(
    db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID, motivo: str | None
) -> Cita:
    """HU-21: registrar la cita como cancelada y liberar el cupo."""
    cita = _del_paciente_con_lock(db, paciente_id, cita_id)
    if not esta_activa(cita):
        db.rollback()
        raise CitaNoModificableError(_por_que_no_se_puede(cita))

    franja = disponibilidad_repository.obtener_con_lock(db, cita.disponibilidad_id)
    cita.estado = EstadoCita.CANCELADA
    cita.cancelada_en = _ahora_utc()
    cita.motivo_cancelacion = motivo or None
    # "...y liberar el cupo": la franja vuelve a estar disponible para
    # cualquier otro paciente.
    franja.estado = EstadoDisponibilidad.DISPONIBLE
    db.commit()
    db.refresh(cita)

    enviar_por_canal(
        cita.paciente,
        cita.canal_recordatorio,
        f"SaludYA: su cita {cita.numero_comprobante} del "
        f"{fecha_legible(franja.fecha)} a las {hora_legible(franja.hora)} fue cancelada.",
    )
    return cita


def reprogramar_cita(
    db: Session,
    paciente_id: uuid.UUID,
    cita_id: uuid.UUID,
    nueva_disponibilidad_id: uuid.UUID,
) -> Cita:
    """
    HU-20: mover la cita a otro horario de la misma especialidad.

    Se reserva primero el horario nuevo y se libera el anterior en la
    MISMA transacción: si algo falla, el paciente conserva su cita
    original; nunca queda sin ninguna de las dos. Devuelve la cita
    nueva (el comprobante se genera aparte, igual que en HU-16/HU-17).
    """
    cita = _del_paciente_con_lock(db, paciente_id, cita_id)
    if not esta_activa(cita):
        db.rollback()
        raise CitaNoModificableError(_por_que_no_se_puede(cita))
    if nueva_disponibilidad_id == cita.disponibilidad_id:
        db.rollback()
        raise ReprogramacionInvalidaError("Ese es el mismo horario de su cita actual.")

    nueva = disponibilidad_repository.obtener_con_lock(db, nueva_disponibilidad_id)
    if nueva is None:
        db.rollback()
        raise DisponibilidadNoEncontradaError(
            f"No existe ninguna disponibilidad con id {nueva_disponibilidad_id}."
        )
    if nueva.estado != EstadoDisponibilidad.DISPONIBLE or _inicio(nueva) <= ahora_colombia():
        db.rollback()
        raise HorarioYaNoDisponibleError("Ese horario ya no está disponible. Por favor elige otro.")

    especialidad_actual = cita.disponibilidad.especialista.especialidad
    if nueva.especialista.especialidad_id != especialidad_actual.id:
        db.rollback()
        raise ReprogramacionInvalidaError(
            f"El nuevo horario debe ser de {especialidad_actual.nombre}, "
            "la misma especialidad de su cita."
        )

    anterior = disponibilidad_repository.obtener_con_lock(db, cita.disponibilidad_id)
    ahora = _ahora_utc()

    # 1) Reservar el horario nuevo con una cita nueva enlazada a la original.
    nueva.estado = EstadoDisponibilidad.RESERVADO
    cita_nueva = Cita(
        paciente_id=paciente_id,
        disponibilidad_id=nueva.id,
        canal_recordatorio=cita.canal_recordatorio,
        estado=EstadoCita.CONFIRMADA,
        creado_en=ahora,
        reprogramada_desde_id=cita.id,
    )
    db.add(cita_nueva)

    # 2) Cerrar la original y liberar su cupo.
    cita.estado = EstadoCita.REPROGRAMADA
    cita.reprogramada_en = ahora
    anterior.estado = EstadoDisponibilidad.DISPONIBLE

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HorarioYaNoDisponibleError("Ese horario ya no está disponible. Por favor elige otro.")

    db.refresh(cita_nueva)
    return cita_nueva
