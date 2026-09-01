"""
Endpoints de catálogo médico — HU-09, HU-10, HU-12, HU-13, HU-14.

Son endpoints de solo lectura, públicos (sin JWT): ningún criterio de
aceptación de estas historias exige que el paciente esté autenticado
para buscar. La autenticación vuelve a ser obligatoria en la Parte 9,
al confirmar una cita.
"""

import uuid
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

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

router = APIRouter(tags=["Catálogo médico"])


def _armar_especialista_out(db: Session, especialista) -> EspecialistaOut:
    modalidades = especialista_repository.obtener_modalidades(db, especialista.id)
    return EspecialistaOut(
        id=especialista.id,
        nombre=especialista.nombre,
        especialidad=especialista.especialidad,
        sedes=especialista.sedes,
        modalidades=modalidades,
    )


@router.get("/especialidades", response_model=list[EspecialidadOut])
def listar_especialidades(db: Session = Depends(get_db)):
    return especialidad_repository.listar_especialidades(db)


@router.get("/sedes", response_model=list[SedeOut])
def listar_sedes(db: Session = Depends(get_db)):
    return sede_repository.listar_sedes(db)


@router.get("/especialistas", response_model=list[EspecialistaOut])
def listar_especialistas(
    especialidad_id: uuid.UUID | None = Query(
        default=None, description="Filtra por especialidad (HU-09)"
    ),
    db: Session = Depends(get_db),
):
    especialistas = especialista_repository.listar_especialistas(db, especialidad_id)
    return [_armar_especialista_out(db, e) for e in especialistas]


@router.get(
    "/especialistas/{especialista_id}/disponibilidad",
    response_model=list[DisponibilidadOut],
)
def listar_disponibilidad(
    especialista_id: uuid.UUID,
    sede_id: uuid.UUID | None = Query(default=None, description="Filtra por sede (HU-13)"),
    modalidad: Modalidad | None = Query(
        default=None, description="Filtra por modalidad (HU-14)"
    ),
    db: Session = Depends(get_db),
):
    especialista = especialista_repository.obtener_por_id(db, especialista_id)
    if especialista is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe ningún especialista con id {especialista_id}.",
        )

    return disponibilidad_repository.listar_disponibilidad(
        db, especialista_id, sede_id=sede_id, modalidad=modalidad
    )


@router.get("/disponibilidad/buscar", response_model=list[DisponibilidadBusquedaOut])
def buscar_disponibilidad(
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
    db: Session = Depends(get_db),
):
    """
    Búsqueda combinada de disponibilidad a través de TODOS los
    especialistas -- HU-11. Todos los filtros son opcionales y se
    combinan con AND (criterio 3: solo resultados que cumplan todos
    los indicados).
    """
    return disponibilidad_repository.buscar_disponibilidad(
        db,
        especialidad_id=especialidad_id,
        ciudad=ciudad,
        sede_id=sede_id,
        modalidad=modalidad,
        fecha=fecha,
        hora=hora,
    )
