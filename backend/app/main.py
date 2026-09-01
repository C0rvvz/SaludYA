"""
Punto de entrada de la aplicación FastAPI de SaludYA.

Parte 1: solo registra el router de /health.
Los routers de identidad (login/registro) y de citas se agregarán
en las partes correspondientes (no se crean todavía a propósito).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging_config import configurar_logging
from app.routers import auth, catalogo, citas, eps, health, pacientes

configurar_logging()

app = FastAPI(title=settings.app_name)

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


@app.get("/")
def root():
    return {
        "message": "SaludYA API está funcionando",
        "entorno": settings.app_env,
    }
