"""
Punto de entrada de la aplicación FastAPI de SaludYA.

Parte 1: solo registra el router de /health.
Los routers de identidad (login/registro) y de citas se agregarán
en las partes correspondientes (no se crean todavía a propósito).
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging_config import configurar_logging
from app.routers import auth, catalogo, chat, citas, eps, health, pacientes
from app.services import recordatorios_service

configurar_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # HU-22: tarea de fondo que envía los recordatorios de cita.
    tarea = None
    if settings.recordatorios_activos:
        tarea = asyncio.create_task(recordatorios_service.ejecutar_periodicamente())
    yield
    if tarea is not None:
        tarea.cancel()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(eps.router, tags=["EPS"])
app.include_router(pacientes.router, tags=["Pacientes"])
app.include_router(auth.router)
app.include_router(catalogo.router)
app.include_router(citas.router)
app.include_router(chat.router)


@app.get("/")
def root():
    return {
        "message": "SaludYA API está funcionando",
        "entorno": settings.app_env,
    }
