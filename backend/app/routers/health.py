"""
Endpoint de salud (/health).

Sirve para comprobar, sin depender de ninguna lógica de negocio
todavía, que:
1. FastAPI está corriendo.
2. FastAPI puede conectarse efectivamente a PostgreSQL.
"""

from fastapi import APIRouter
from sqlalchemy import text

from app.core.database import engine

router = APIRouter()


@router.get("/health")
def health_check():
    db_status = "ok"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {e}"

    return {
        "status": "ok",
        "service": "SaludYA API",
        "database": db_status,
    }
