"""
Punto de entrada de la aplicación FastAPI de SaludYA.

Parte 1: solo registra el router de /health.
Los routers de identidad (login/registro) y de citas se agregarán
en las partes correspondientes (no se crean todavía a propósito).
"""

from fastapi import FastAPI

from app.core.config import settings
from app.routers import health

app = FastAPI(title=settings.app_name)

app.include_router(health.router, tags=["Health"])


@app.get("/")
def root():
    return {
        "message": "SaludYA API está funcionando",
        "entorno": settings.app_env,
    }
