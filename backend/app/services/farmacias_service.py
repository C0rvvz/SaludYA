"""
Farmacias donde los pacientes reclaman su fórmula médica, en el panel del
personal (junto a las sedes): agregarlas, editarlas y cerrarlas (o volver
a abrirlas).

- Cada una está cerca de una sede, a cierta distancia: así el paciente ve
  primero las cercanas a donde lo atendieron (formulas_service.farmacias_para).
- Aliada: entrega gratis, con el código de la fórmula, los medicamentos
  que cubre la EPS. Las demás cobran.
- Con la dirección, "Cómo llegar" lleva a la puerta; sin ella, al barrio.
- No se repite el mismo nombre en el mismo barrio y ciudad.
- Una farmacia cerrada ya no se le muestra al paciente.
- Cada cambio queda en la auditoría.
"""

import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.formula_medica import Farmacia
from app.models.sede import Sede
from app.services import auditoria_service
from app.services.auditoria_service import Actor
from app.services.exceptions import FarmaciaInvalidaError

DISTANCIA_MAXIMA_KM = 50


def _limpio(texto: str | None) -> str:
    return " ".join((texto or "").split())


def _obtener(db: Session, farmacia_id: uuid.UUID) -> Farmacia:
    farmacia = db.get(Farmacia, farmacia_id)
    if farmacia is None:
        raise FarmaciaInvalidaError("No existe esa farmacia.")
    return farmacia


def _resumen(f: Farmacia) -> str:
    """"Aliada · 0,8 km de Sede Poblado", para el detalle de la auditoría."""
    distancia = f"{f.distancia_km:.1f}".replace(".", ",")
    return f"{'Aliada' if f.aliada else 'No aliada'} · {distancia} km de {f.sede.nombre if f.sede else 'ninguna sede'}"


def _validar(
    db: Session, nombre: str, barrio: str, ciudad: str, sede_id: uuid.UUID, distancia_km: float,
    actual: Farmacia | None = None,
) -> None:
    if len(nombre) < 3 or len(barrio) < 2 or len(ciudad) < 2:
        raise FarmaciaInvalidaError("Escriba el nombre de la farmacia, su barrio y su ciudad.")
    if not 0 < distancia_km <= DISTANCIA_MAXIMA_KM:
        raise FarmaciaInvalidaError(f"La distancia a la sede debe ser de 0,1 a {DISTANCIA_MAXIMA_KM} km.")
    sede = db.get(Sede, sede_id)
    # Si la sede que ya tenía se cerró, puede quedarse con ella; una nueva debe estar abierta.
    if sede is None or (not sede.activa and (actual is None or actual.sede_id != sede_id)):
        raise FarmaciaInvalidaError("Elija una sede abierta de la red.")
    repetida = (
        db.query(Farmacia)
        .filter(
            func.lower(Farmacia.nombre) == nombre.lower(),
            func.lower(Farmacia.barrio) == barrio.lower(),
            func.lower(Farmacia.ciudad) == ciudad.lower(),
            Farmacia.id != (actual.id if actual else None),
        )
        .first()
    )
    if repetida:
        raise FarmaciaInvalidaError(f"Ya existe {repetida.nombre} en {repetida.barrio}, {repetida.ciudad}.")


def crear(
    db: Session, actor: Actor, nombre: str, barrio: str, ciudad: str, direccion: str | None,
    aliada: bool, sede_id: uuid.UUID, distancia_km: float,
) -> Farmacia:
    nombre, barrio, ciudad, direccion = _limpio(nombre), _limpio(barrio), _limpio(ciudad), _limpio(direccion) or None
    _validar(db, nombre, barrio, ciudad, sede_id, distancia_km)
    farmacia = Farmacia(
        nombre=nombre, barrio=barrio, ciudad=ciudad, direccion=direccion, aliada=aliada,
        sede_id=sede_id, distancia_km=round(distancia_km, 1),
    )
    db.add(farmacia)
    db.flush()
    db.refresh(farmacia)  # carga su sede para el resumen
    auditoria_service.registrar(
        db, actor, "crear_farmacia", f"Agregó la farmacia {nombre} ({barrio}, {ciudad})", detalle=_resumen(farmacia)
    )
    db.commit()
    db.refresh(farmacia)
    return farmacia


def editar(
    db: Session, actor: Actor, farmacia_id: uuid.UUID, nombre: str, barrio: str, ciudad: str,
    direccion: str | None, aliada: bool, sede_id: uuid.UUID, distancia_km: float,
) -> Farmacia:
    farmacia = _obtener(db, farmacia_id)
    nombre, barrio, ciudad, direccion = _limpio(nombre), _limpio(barrio), _limpio(ciudad), _limpio(direccion) or None
    _validar(db, nombre, barrio, ciudad, sede_id, distancia_km, farmacia)
    antes, antes_resumen = farmacia.nombre, _resumen(farmacia)
    farmacia.nombre, farmacia.barrio, farmacia.ciudad, farmacia.direccion = nombre, barrio, ciudad, direccion
    farmacia.aliada, farmacia.sede_id, farmacia.distancia_km = aliada, sede_id, round(distancia_km, 1)
    db.flush()
    db.refresh(farmacia)
    despues = _resumen(farmacia)
    auditoria_service.registrar(
        db, actor, "editar_farmacia", f"Editó la farmacia {antes}",
        estado_anterior=antes_resumen[:60] if antes_resumen != despues else None,
        estado_nuevo=despues[:60] if antes_resumen != despues else None,
        detalle=direccion,
    )
    db.commit()
    db.refresh(farmacia)
    return farmacia


def cambiar_estado(db: Session, actor: Actor, farmacia_id: uuid.UUID, activa: bool) -> Farmacia:
    farmacia = _obtener(db, farmacia_id)
    if farmacia.activa == activa:
        return farmacia
    farmacia.activa = activa
    auditoria_service.registrar(
        db, actor, "activar_farmacia" if activa else "desactivar_farmacia",
        f"{'Abrió de nuevo' if activa else 'Cerró'} la farmacia {farmacia.nombre}",
    )
    db.commit()
    db.refresh(farmacia)
    return farmacia


def datos(f: Farmacia) -> dict:
    return {
        "id": f.id,
        "nombre": f.nombre,
        "barrio": f.barrio,
        "ciudad": f.ciudad,
        "direccion": f.direccion,
        "aliada": f.aliada,
        "activa": f.activa,
        "sede_id": f.sede_id,
        "sede": f.sede.nombre if f.sede else None,
        "distancia_km": f.distancia_km,
    }


def listar(db: Session) -> list[dict]:
    """Todas, las abiertas primero."""
    return [datos(f) for f in db.query(Farmacia).order_by(Farmacia.activa.desc(), Farmacia.nombre).all()]
