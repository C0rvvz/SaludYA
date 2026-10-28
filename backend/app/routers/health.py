"""
Endpoint de salud (/health).

Sirve para comprobar, sin depender de ninguna lógica de negocio
todavía, que:
1. FastAPI está corriendo.
2. FastAPI puede conectarse efectivamente a PostgreSQL.
"""

import logging

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

router = APIRouter()
logger = logging.getLogger("saludya.health")


@router.get("/health")
def health_check():
    db_status = "ok"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        logger.error("La API no se pudo conectar a la base de datos: %s", e)
        # Fuera de desarrollo, sin el detalle: puede traer el servidor y el usuario de la base.
        db_status = f"error: {e}" if settings.es_desarrollo else "error"

    return {
        "status": "ok",
        "service": "SaludYA API",
        "database": db_status,
    }
