"""
Gestión de citas por el personal — HU-34 a HU-43.

Las acciones que cambian la cita (confirmar, reprogramar, cancelar,
registrar el resultado) reutilizan citas_service, las mismas funciones
que usa el paciente, con el personal como actor. Aquí queda lo propio
del personal: qué acciones le corresponden a cada usuario, el registro
de llamadas (HU-37) y las observaciones (HU-41).
"""

import uuid
from collections import defaultdict

from sqlalchemy.orm import Session

from app.core.permisos import PERMISOS_POR_ROL, Permiso
from app.models.cita import Cita
from app.models.observacion import Observacion
from app.models.personal import Personal
from app.repositories import cita_repository, observacion_repository, paciente_repository
from app.services import auditoria_service, citas_service
from app.services.auditoria_service import Actor
from app.services.exceptions import CitaNoEncontradaError

RESULTADOS_CONTACTO = {
    "contesto": "Contestó",
    "no_contesto": "No contestó",
    "numero_equivocado": "Número equivocado",
    "buzon_de_voz": "Buzón de voz",
}


def acciones_para(cita: Cita, personal: Personal) -> dict[str, bool]:
    """HU-43, criterio 2: las acciones permitidas según el estado de la cita y el rol."""
    permisos = PERMISOS_POR_ROL[personal.rol]
    activa = citas_service.esta_activa(cita)
    return {
        "confirmar": Permiso.CONFIRMAR_ASISTENCIA in permisos and activa and cita.asistencia_confirmada_en is None,
        "reprogramar": Permiso.REPROGRAMAR_CANCELAR in permisos and activa,
        "cancelar": Permiso.REPROGRAMAR_CANCELAR in permisos and activa,
        "recordatorio": Permiso.RECORDATORIOS in permisos and activa,
        "contactar": Permiso.RECORDATORIOS in permisos,
        "registrar_resultado": Permiso.REGISTRAR_ATENCION in permisos and citas_service.puede_registrar_resultado(cita),
        "observar": Permiso.OBSERVACIONES in permisos,
    }


def historial_por_paciente(db: Session, citas: list[Cita]) -> dict[uuid.UUID, list[Cita]]:
    """Todas las citas de los pacientes de `citas`, agrupadas por paciente (una sola consulta)."""
    agrupadas: dict[uuid.UUID, list[Cita]] = defaultdict(list)
    for c in cita_repository.listar_por_pacientes(db, {c.paciente_id for c in citas}):
        agrupadas[c.paciente_id].append(c)
    return agrupadas


def obtener_cita(db: Session, cita_id: uuid.UUID) -> Cita:
    cita = cita_repository.obtener_por_id(db, cita_id)
    if cita is None:
        raise CitaNoEncontradaError("No existe esa cita.")
    return cita


def registrar_contacto(
    db: Session, cita_id: uuid.UUID, resultado: str, nota: str | None, actor: Actor
) -> None:
    """
    HU-37: la llamada la inicia el personal desde su teléfono (el enlace
    de llamada en la pantalla); aquí queda registrado su resultado en el
    historial de la cita (criterio 4).
    """
    cita = obtener_cita(db, cita_id)
    auditoria_service.registrar(
        db, actor, "contacto", descripcion_contacto(resultado), cita=cita, detalle=nota or None,
    )
    db.commit()


def descripcion_contacto(resultado: str) -> str:
    """Texto de la llamada en la auditoría; el Centro de recordatorios lo usa para saber si contestó."""
    return f"Llamó al paciente: {RESULTADOS_CONTACTO[resultado]}"


def agregar_observacion(
    db: Session, paciente_id: uuid.UUID, texto: str, cita_id: uuid.UUID | None, personal: Personal
) -> Observacion:
    """HU-41: nota sobre el paciente, y opcionalmente sobre una de sus citas."""
    if paciente_repository.obtener_por_id(db, paciente_id) is None:
        raise CitaNoEncontradaError("No existe ese paciente.")
    cita = None
    if cita_id is not None:
        cita = cita_repository.obtener_por_id(db, cita_id)
        if cita is None or cita.paciente_id != paciente_id:
            raise CitaNoEncontradaError("Esa cita no es de este paciente.")

    observacion = Observacion(
        paciente_id=paciente_id, cita_id=cita_id, personal_id=personal.id, texto=texto
    )
    db.add(observacion)
    auditoria_service.registrar(
        db, Actor.de_personal(personal), "observacion", "Agregó una observación",
        cita=cita, paciente_id=paciente_id,
    )
    db.commit()
    db.refresh(observacion)
    return observacion


def observaciones_del_paciente(db: Session, paciente_id: uuid.UUID) -> list[Observacion]:
    return observacion_repository.listar_por_paciente(db, paciente_id)
