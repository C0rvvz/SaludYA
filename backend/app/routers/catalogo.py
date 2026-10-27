"""
Endpoints de catálogo médico — HU-09, HU-10, HU-12, HU-13, HU-14.

Son endpoints de solo lectura, públicos (sin JWT): ningún criterio de
aceptación de estas historias exige que el paciente esté autenticado
para buscar. La autenticación vuelve a ser obligatoria en la Parte 9,
al confirmar una cita.

RNF-21 (500 usuarios a la vez): son las rutas con más tráfico, así que
cada una arma su respuesta y devuelve la conexión a la base antes de
salir (_respuesta). Si no, la conexión quedaba tomada mientras la
respuesta esperaba turno para convertirse a JSON, y con cientos de
usuarios se acababan las conexiones (lo mostró app/scripts/prueba_carga.py).

Además, cada respuesta se reutiliza CACHE_CATALOGO_SEGUNDOS (2 s): con
cientos de pacientes mirando las mismas especialidades, casi todas salen
de memoria. SUPUESTO: un horario recién tomado puede verse libre hasta
2 s más; al confirmar la cita se vuelve a validar con bloqueo (HU-16,
criterio 3) y el paciente ve que ya no está disponible.
"""

import threading
import time as reloj
import uuid
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.especialista import Modalidad
from app.repositories import (
    disponibilidad_repository,
    especialidad_repository,
    especialista_repository,
    sede_repository,
)
from app.schemas.especialidad import EspecialidadOut
from app.schemas.especialista import DisponibilidadBusquedaOut, DisponibilidadOut, EspecialistaOut
from app.schemas.sede import SedeOut
from app.services import eps_service

router = APIRouter(tags=["Catálogo médico"])


_MAX_EN_CACHE = 500  # respuestas distintas guardadas a la vez (los parámetros los elige quien llama)
_cache: dict[str, tuple[float, bytes]] = {}
_lock = threading.Lock()


def _json(contenido: bytes) -> Response:
    return Response(content=contenido, media_type="application/json")


def _de_la_cache(request: Request) -> Response | None:
    if settings.cache_catalogo_segundos <= 0:
        return None
    with _lock:
        guardada = _cache.get(str(request.url))
    return _json(guardada[1]) if guardada and guardada[0] > reloj.monotonic() else None


def _respuesta(db: Session, request: Request, tipo, objetos) -> Response:
    """
    La respuesta ya convertida a JSON (una sola vez: FastAPI no la vuelve a
    validar), guardada en la caché y con la conexión a la base devuelta de una vez.
    """
    adaptador = TypeAdapter(tipo)
    contenido = adaptador.dump_json(adaptador.validate_python(objetos, from_attributes=True))
    db.rollback()  # termina la transacción (solo lectura): la conexión vuelve de una vez al pool
    if settings.cache_catalogo_segundos > 0:
        ahora = reloj.monotonic()
        with _lock:
            if len(_cache) >= _MAX_EN_CACHE:
                for clave in [c for c, (vence, _) in _cache.items() if vence <= ahora] or list(_cache):
                    del _cache[clave]
            _cache[str(request.url)] = (ahora + settings.cache_catalogo_segundos, contenido)
    return _json(contenido)


def vaciar_cache() -> None:
    with _lock:
        _cache.clear()


def _armar_especialista_out(db: Session, especialista) -> EspecialistaOut:
    modalidades = especialista_repository.obtener_modalidades(db, especialista.id)
    return EspecialistaOut(
        id=especialista.id,
        nombre=especialista.nombre,
        especialidad=especialista.especialidad,
        eps=especialista.eps,
        sedes=especialista.sedes,
        modalidades=modalidades,
    )


@router.get("/especialidades", response_model=list[EspecialidadOut])
def listar_especialidades(request: Request, db: Session = Depends(get_db)):
    if guardada := _de_la_cache(request):
        return guardada
    return _respuesta(db, request, list[EspecialidadOut], especialidad_repository.listar_especialidades(db))


@router.get("/sedes", response_model=list[SedeOut])
def listar_sedes(request: Request, db: Session = Depends(get_db)):
    if guardada := _de_la_cache(request):
        return guardada
    return _respuesta(db, request, list[SedeOut], sede_repository.listar_sedes(db))


@router.get("/especialistas", response_model=list[EspecialistaOut])
def listar_especialistas(
    request: Request,
    especialidad_id: uuid.UUID | None = Query(
        default=None, description="Filtra por especialidad (HU-09)"
    ),
    db: Session = Depends(get_db),
):
    if guardada := _de_la_cache(request):
        return guardada
    especialistas = especialista_repository.listar_especialistas(db, especialidad_id)
    return _respuesta(db, request, list[EspecialistaOut], [_armar_especialista_out(db, e) for e in especialistas])


@router.get(
    "/especialistas/{especialista_id}/disponibilidad",
    response_model=list[DisponibilidadOut],
)
def listar_disponibilidad(
    request: Request,
    especialista_id: uuid.UUID,
    sede_id: uuid.UUID | None = Query(default=None, description="Filtra por sede (HU-13)"),
    modalidad: Modalidad | None = Query(
        default=None, description="Filtra por modalidad (HU-14)"
    ),
    db: Session = Depends(get_db),
):
    if guardada := _de_la_cache(request):
        return guardada
    especialista = especialista_repository.obtener_por_id(db, especialista_id)
    if especialista is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No encontramos ese especialista.",
        )

    franjas = disponibilidad_repository.listar_disponibilidad(
        db, especialista_id, sede_id=sede_id, modalidad=modalidad
    )
    return _respuesta(db, request, list[DisponibilidadOut], franjas)


@router.get("/disponibilidad/buscar", response_model=list[DisponibilidadBusquedaOut])
def buscar_disponibilidad(
    request: Request,
    especialidad_id: uuid.UUID | None = Query(
        default=None, description="Filtra por especialidad (HU-09/HU-11)"
    ),
    ciudad: str | None = Query(default=None, description="Filtra por ciudad (HU-11)"),
    sede_id: uuid.UUID | None = Query(default=None, description="Filtra por sede (HU-11/HU-13)"),
    modalidad: Modalidad | None = Query(
        default=None, description="Filtra por modalidad (HU-11/HU-14)"
    ),
    fecha: date | None = Query(default=None, description="Filtra por fecha (HU-11)"),
    hora: time | None = Query(
        default=None, description="Filtra por horario exacto (HU-11)"
    ),
    para_eps: uuid.UUID | None = Query(
        default=None, description="Solo médicos que atienden a afiliados de esta EPS (los suyos y los de sus aliadas)"
    ),
    db: Session = Depends(get_db),
):
    """
    Búsqueda combinada de disponibilidad a través de TODOS los
    especialistas -- HU-11. Todos los filtros son opcionales y se
    combinan con AND (criterio 3: solo resultados que cumplan todos
    los indicados). Cada franja trae la EPS de su médico: el paciente
    ve también los de otras EPS (sin poder elegirlos).
    """
    if guardada := _de_la_cache(request):
        return guardada
    franjas = disponibilidad_repository.buscar_disponibilidad(
        db,
        especialidad_id=especialidad_id,
        ciudad=ciudad,
        sede_id=sede_id,
        modalidad=modalidad,
        fecha=fecha,
        hora=hora,
        eps_ids=({para_eps} | eps_service.aliadas_de(db, para_eps)) if para_eps else None,
    )
    return _respuesta(db, request, list[DisponibilidadBusquedaOut], franjas)
