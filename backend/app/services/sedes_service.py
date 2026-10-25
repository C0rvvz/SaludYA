"""
Sedes en el panel del personal — RF-89: crearlas, editarlas y cerrarlas
(o volver a abrirlas).

- El nombre no se repite (sin distinguir mayúsculas).
- Una sede no se cierra mientras algún especialista activo tenga turnos
  en ella: primero se le cambia el horario (así nadie queda con horarios
  en una sede cerrada). Las citas que ya tenía se conservan.
- Cada cambio queda en la auditoría.
"""

import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.cita import Cita
from app.models.disponibilidad import Disponibilidad
from app.models.especialista import Especialista, TurnoEspecialista
from app.models.sede import Sede
from app.services import auditoria_service, citas_service
from app.services.auditoria_service import Actor
from app.services.exceptions import SedeInvalidaError
from app.utils.tiempo import hoy_en_colombia


def _limpio(texto: str | None) -> str:
    return " ".join((texto or "").split())


def _obtener(db: Session, sede_id: uuid.UUID) -> Sede:
    sede = db.get(Sede, sede_id)
    if sede is None:
        raise SedeInvalidaError("No existe esa sede.")
    return sede


def _validar(db: Session, nombre: str, ciudad: str, sede_id: uuid.UUID | None = None) -> None:
    if len(nombre) < 3 or len(ciudad) < 2:
        raise SedeInvalidaError("Escriba el nombre de la sede y su ciudad.")
    repetida = db.query(Sede).filter(func.lower(Sede.nombre) == nombre.lower(), Sede.id != sede_id).first()
    if repetida:
        raise SedeInvalidaError(f"Ya existe una sede llamada {repetida.nombre}.")


def crear(db: Session, actor: Actor, nombre: str, ciudad: str, direccion: str | None) -> Sede:
    nombre, ciudad, direccion = _limpio(nombre), _limpio(ciudad), _limpio(direccion) or None
    _validar(db, nombre, ciudad)
    sede = Sede(nombre=nombre, ciudad=ciudad, direccion=direccion)
    db.add(sede)
    auditoria_service.registrar(db, actor, "crear_sede", f"Agregó la sede {nombre} ({ciudad})", detalle=direccion)
    db.commit()
    db.refresh(sede)
    return sede


def editar(db: Session, actor: Actor, sede_id: uuid.UUID, nombre: str, ciudad: str, direccion: str | None) -> Sede:
    sede = _obtener(db, sede_id)
    nombre, ciudad, direccion = _limpio(nombre), _limpio(ciudad), _limpio(direccion) or None
    _validar(db, nombre, ciudad, sede.id)
    antes = sede.nombre
    sede.nombre, sede.ciudad, sede.direccion = nombre, ciudad, direccion
    auditoria_service.registrar(
        db, actor, "editar_sede", f"Editó la sede {antes}",
        estado_anterior=antes[:60], estado_nuevo=nombre[:60], detalle=direccion,
    )
    db.commit()
    db.refresh(sede)
    return sede


def _con_turnos(db: Session, sede_id: uuid.UUID) -> list[str]:
    """Los especialistas activos que tienen turnos en la sede."""
    filas = (
        db.query(Especialista.nombre)
        .join(TurnoEspecialista, TurnoEspecialista.especialista_id == Especialista.id)
        .filter(TurnoEspecialista.sede_id == sede_id, Especialista.activo.is_(True))
        .distinct()
        .order_by(Especialista.nombre)
        .all()
    )
    return [nombre for (nombre,) in filas]


def _citas_proximas(db: Session, sede_id: uuid.UUID) -> int:
    citas = (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .filter(Disponibilidad.sede_id == sede_id, Disponibilidad.fecha >= hoy_en_colombia())
        .all()
    )
    return sum(1 for c in citas if citas_service.esta_activa(c))


def cambiar_estado(db: Session, actor: Actor, sede_id: uuid.UUID, activa: bool) -> Sede:
    sede = _obtener(db, sede_id)
    if sede.activa == activa:
        return sede
    if not activa:
        quienes = _con_turnos(db, sede.id)
        if quienes:
            raise SedeInvalidaError(
                f"Antes de cerrar {sede.nombre}, cambie el horario de: {', '.join(quienes)}."
            )
    sede.activa = activa
    conserva = 0 if activa else _citas_proximas(db, sede.id)
    auditoria_service.registrar(
        db, actor, "activar_sede" if activa else "desactivar_sede",
        f"{'Abrió de nuevo' if activa else 'Cerró'} la sede {sede.nombre}",
        detalle=f"Conserva {conserva} citas ya agendadas" if conserva else None,
    )
    db.commit()
    db.refresh(sede)
    return sede


def datos(db: Session, s: Sede) -> dict:
    """Lo que ve el personal de una sede: quién atiende en ella y sus citas próximas."""
    return {
        "id": s.id,
        "nombre": s.nombre,
        "ciudad": s.ciudad,
        "direccion": s.direccion,
        "activa": s.activa,
        "especialistas": _con_turnos(db, s.id),
        "citas_proximas": _citas_proximas(db, s.id),
    }


def listar(db: Session) -> list[dict]:
    """Todas, las abiertas primero."""
    return [datos(db, s) for s in db.query(Sede).order_by(Sede.activa.desc(), Sede.nombre).all()]
