"""
Endpoint de catálogo de EPS — apoya el formulario de registro (HU-08).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories import eps_repository
from app.schemas.eps import EpsOut

router = APIRouter()


@router.get("/eps", response_model=list[EpsOut])
def listar_eps(db: Session = Depends(get_db)):
    return eps_repository.listar_eps(db)
