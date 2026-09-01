"""
Servicio de confirmación de cita — HU-16.

HU-15 (seleccionar fecha/hora) ya queda resuelta por los endpoints de
disponibilidad de las Partes 7 y 8 (criterios 1-3: ahí se muestran
fechas/horarios disponibles y nunca uno ocupado). El criterio 4 de
HU-15 ("la fecha/hora deben guardarse para la cita") se cumple
exactamente aquí: el disponibilidad_id que el paciente eligió es lo
que esta función persiste como parte de la cita.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.cita import CanalContacto, Cita, EstadoCita
from app.models.disponibilidad import EstadoDisponibilidad
from app.repositories import cita_repository, disponibilidad_repository
from app.services.exceptions import DisponibilidadNoEncontradaError, HorarioYaNoDisponibleError


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

    disponibilidad.estado = EstadoDisponibilidad.RESERVADO

    # --- HU-16, criterio 4: registrar definitivamente la cita ---
    cita = Cita(
        paciente_id=paciente_id,
        disponibilidad_id=disponibilidad.id,
        canal_recordatorio=canal_recordatorio,
        estado=EstadoCita.CONFIRMADA,
        creado_en=datetime.now(timezone.utc),
    )
    db.add(cita)

    try:
        db.commit()
    except IntegrityError:
        # Red de seguridad adicional: si dos confirmaciones llegaran
        # exactamente al mismo tiempo pese al bloqueo de fila, la
        # restricción UNIQUE de disponibilidad_id en "citas" (Parte 2)
        # rechaza la segunda de todas formas.
        db.rollback()
        raise HorarioYaNoDisponibleError(
            "Ese horario ya no está disponible. Por favor elige otro."
        )

    db.refresh(cita)
    return cita
