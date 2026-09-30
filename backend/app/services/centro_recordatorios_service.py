"""
Centro de recordatorios — HU-62 a HU-67.

- HU-63 / HU-67: pacientes con su canal preferido, el último envío y su
  estado. Sale de lo que ya existe: las citas y la auditoría, donde
  quedan los recordatorios automáticos (HU-22) y manuales (HU-36), las
  llamadas (HU-37) y los programados de aquí.
- HU-62: el filtro por canal lo aplica la pantalla sobre esta lista.
- HU-64 / HU-65: programar un mensaje escrito o una llamada; la tarea de
  fondo lo envía a su hora (enviar_programados_vencidos).
- HU-66: plantillas Recordatorio estándar, Confirmación urgente y Cupo
  liberado, rellenadas con los datos de la cita.

SUPUESTO: el canal preferido es el que el paciente eligió en su cita más
reciente (la última que agendó).
SUPUESTO: el estado del último envío es "enviado", "fallido" o
"respondido" (confirmó su asistencia después del envío, o contestó la
llamada). "Leído" y "entregado" requieren la integración real de
WhatsApp (webhooks de Meta); los demás canales se simulan.
SUPUESTO: la llamada programada se simula como un mensaje de voz
automático, igual que SMS y correo (ver integrations/notificaciones.py).
"""

import uuid
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import CanalContacto, Cita
from app.models.paciente import Paciente
from app.models.personal import Personal
from app.models.recordatorio_programado import EstadoProgramacion, RecordatorioProgramado
from app.repositories import (
    auditoria_repository,
    cita_repository,
    paciente_repository,
    recordatorio_programado_repository,
)
from app.services import auditoria_service, citas_service
from app.services.admin_citas_service import descripcion_contacto
from app.services.auditoria_service import SISTEMA, Actor
from app.services.exceptions import ProgramacionInvalidaError
from app.services.recordatorios_service import NOMBRE_CANAL, enlace_confirmacion, mensaje_recordatorio
from app.utils.tiempo import ZONA_COLOMBIA, fecha_legible, hora_legible

# Acciones de la auditoría que cuentan como un envío al paciente.
ACCIONES_ENVIO = ["recordatorio", "recordatorio_fallido", "contacto"]

# HU-66, criterios 2 a 4
PLANTILLAS = {
    "recordatorio_estandar": "Recordatorio estándar",
    "confirmacion_urgente": "Confirmación urgente",
    "cupo_liberado": "Cupo liberado",
}


def _cuando(momento: datetime) -> str:
    local = momento.astimezone(ZONA_COLOMBIA)
    return f"{fecha_legible(local.date())} a las {hora_legible(local.time())}"


def _inicio(cita: Cita) -> datetime:
    return datetime.combine(cita.disponibilidad.fecha, cita.disponibilidad.hora, tzinfo=ZONA_COLOMBIA)


def texto_de_plantilla(clave: str, paciente: Paciente, cita: Cita | None) -> str | None:
    """HU-66. None si la plantilla necesita una cita y no se eligió ninguna."""
    if clave == "cupo_liberado":
        if cita is None:
            return (
                f"SaludYA: {paciente.nombre}, se liberaron cupos para citas médicas. "
                f"Ingrese a {settings.frontend_url} para agendar la suya."
            )
        return (
            f"SaludYA: {paciente.nombre}, se liberó un cupo de "
            f"{cita.disponibilidad.especialista.especialidad.nombre} antes de su cita del "
            f"{fecha_legible(cita.disponibilidad.fecha)}. Si desea adelantarla, ingrese a "
            f"{settings.frontend_url}/mis-citas y reprográmela."
        )
    if cita is None:
        return None
    if clave == "recordatorio_estandar":
        return mensaje_recordatorio(cita)
    franja = cita.disponibilidad
    return (
        f"SaludYA - URGENTE: {paciente.nombre}, su cita de {franja.especialista.especialidad.nombre} "
        f"es el {fecha_legible(franja.fecha)} a las {hora_legible(franja.hora)} y aún no ha "
        f"confirmado su asistencia. Confírmela aquí: {enlace_confirmacion(cita)}. "
        "Si no puede asistir, cancélela para liberar el cupo."
    )


def _cita_del_paciente(db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID) -> Cita:
    cita = cita_repository.obtener_por_id(db, cita_id)
    if cita is None or cita.paciente_id != paciente_id:
        raise ProgramacionInvalidaError("Esa cita no es de este paciente.")
    return cita


def plantillas(db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID | None) -> list[dict]:
    """HU-66, criterio 1: las plantillas disponibles, con el texto listo para el paciente y la cita."""
    paciente = paciente_repository.obtener_por_id(db, paciente_id)
    if paciente is None:
        raise ProgramacionInvalidaError("No existe ese paciente.")
    cita = _cita_del_paciente(db, paciente_id, cita_id) if cita_id else None
    return [
        {"clave": clave, "nombre": nombre, "texto": texto_de_plantilla(clave, paciente, cita)}
        for clave, nombre in PLANTILLAS.items()
    ]


def _estado(envio, citas: list[Cita]) -> str | None:
    if envio is None:
        return None
    if envio.accion == "contacto":
        estado = "respondido" if envio.descripcion == descripcion_contacto("contesto") else "fallido"
    else:
        estado = "enviado" if envio.accion == "recordatorio" else "fallido"
    if any(c.asistencia_confirmada_en and c.asistencia_confirmada_en > envio.fecha for c in citas):
        return "respondido"
    return estado


def pacientes_con_recordatorios(db: Session) -> list[dict]:
    """HU-63 / HU-67, criterio 1."""
    # ponytail: carga todas las citas de todos los pacientes; paginar si llegan a miles de pacientes.
    pacientes = paciente_repository.listar(db)
    citas = defaultdict(list)
    for c in cita_repository.listar_por_pacientes(db, {p.id for p in pacientes}):
        citas[c.paciente_id].append(c)
    envios = auditoria_repository.ultimos_por_paciente(db, ACCIONES_ENVIO)
    proximos = {}
    for r in recordatorio_programado_repository.pendientes(db):
        proximos.setdefault(r.paciente_id, r.programado_para)

    filas = []
    for p in pacientes:
        suyas = citas[p.id]
        envio = envios.get(p.id)
        activas = sorted((c for c in suyas if citas_service.esta_activa(c)), key=_inicio)
        filas.append({
            "paciente_id": p.id,
            "nombre": p.nombre,
            "numero_documento": p.numero_documento,
            "telefono_whatsapp": p.telefono_whatsapp,
            "canal_preferido": max(suyas, key=lambda c: c.creado_en).canal_recordatorio if suyas else None,
            "ultimo_envio_en": envio.fecha if envio else None,
            "ultimo_envio": envio.descripcion if envio else None,
            "estado": _estado(envio, suyas),
            "proximo_programado_en": proximos.get(p.id),
            "citas_activas": [
                {
                    "id": c.id,
                    "fecha": c.disponibilidad.fecha,
                    "hora": c.disponibilidad.hora,
                    "especialidad": c.disponibilidad.especialista.especialidad.nombre,
                    "numero_comprobante": c.numero_comprobante,
                }
                for c in activas
            ],
        })
    return filas


def programar(
    db: Session,
    personal: Personal,
    paciente_id: uuid.UUID,
    cita_id: uuid.UUID | None,
    canal: CanalContacto,
    plantilla: str | None,
    texto: str,
    programado_para: datetime,
) -> RecordatorioProgramado:
    """HU-64 (mensaje escrito) y HU-65 (llamada, canal "llamada"). Criterio: queda registrado."""
    if programado_para.tzinfo is None:  # la pantalla envía la hora de Colombia sin zona
        programado_para = programado_para.replace(tzinfo=ZONA_COLOMBIA)
    if paciente_repository.obtener_por_id(db, paciente_id) is None:
        raise ProgramacionInvalidaError("No existe ese paciente.")
    if programado_para <= datetime.now(timezone.utc):
        raise ProgramacionInvalidaError("La fecha y hora del envío deben ser futuras.")
    cita = None
    if cita_id is not None:
        cita = _cita_del_paciente(db, paciente_id, cita_id)
        if not citas_service.esta_activa(cita):
            raise ProgramacionInvalidaError("Esa cita ya no está vigente.")
        if programado_para >= _inicio(cita):
            raise ProgramacionInvalidaError("El recordatorio debe programarse antes de la cita.")

    programado = RecordatorioProgramado(
        paciente_id=paciente_id,
        cita_id=cita_id,
        personal_id=personal.id,
        canal=canal,
        plantilla=plantilla,
        texto=texto,
        programado_para=programado_para,
    )
    db.add(programado)
    que = "una llamada" if canal == CanalContacto.LLAMADA else f"un mensaje por {NOMBRE_CANAL[canal]}"
    auditoria_service.registrar(
        db, Actor.de_personal(personal), "programar_recordatorio",
        f"Programó {que} para el {_cuando(programado_para)}",
        cita=cita, paciente_id=paciente_id, detalle=texto,
    )
    db.commit()
    db.refresh(programado)
    return programado


def listar_programados(db: Session) -> list[RecordatorioProgramado]:
    return recordatorio_programado_repository.listar(db)


def enviar_programados_vencidos(db: Session) -> int:
    """Tarea de fondo: envía los programados que ya llegaron a su hora. Devuelve cuántos salieron."""
    ahora = datetime.now(timezone.utc)
    enviados = 0
    for r in recordatorio_programado_repository.pendientes(db, hasta=ahora):
        salio = enviar_por_canal(r.paciente, r.canal, r.texto)
        r.estado = EstadoProgramacion.ENVIADO if salio else EstadoProgramacion.FALLIDO
        r.enviado_en = ahora if salio else None
        que = (
            "la llamada programada (mensaje de voz)"
            if r.canal == CanalContacto.LLAMADA
            else f"el mensaje programado por {NOMBRE_CANAL[r.canal]}"
        )
        auditoria_service.registrar(
            db, SISTEMA, "recordatorio" if salio else "recordatorio_fallido",
            f"Envió {que}" if salio else f"No se pudo enviar {que}",
            cita=r.cita, paciente_id=r.paciente_id, detalle=f"Programado por {r.personal.nombre}",
        )
        enviados += salio
    db.commit()
    return enviados
