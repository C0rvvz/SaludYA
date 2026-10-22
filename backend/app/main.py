"""
Punto de entrada de la aplicación FastAPI de SaludYA.

Parte 1: solo registra el router de /health.
Los routers de identidad (login/registro) y de citas se agregarán
en las partes correspondientes (no se crean todavía a propósito).
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging_config import configurar_logging
from app.routers import admin, auth, catalogo, chat, citas, eps, health, lista_espera, pacientes, solicitudes
from app.services import tareas_periodicas

configurar_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # HU-22 / HU-25: recordatorios y cierre de citas pasadas en segundo plano.
    tarea = None
    if settings.tareas_periodicas_activas:
        tarea = asyncio.create_task(tareas_periodicas.ejecutar_periodicamente())
    yield
    if tarea is not None:
        tarea.cancel()


# La documentación interactiva (/docs) muestra todos los endpoints: solo en
# desarrollo, para no darle el mapa de la API a un atacante.
_DOCS = settings.es_desarrollo
app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url="/docs" if _DOCS else None,
    redoc_url="/redoc" if _DOCS else None,
    openapi_url="/openapi.json" if _DOCS else None,
)

# Solo el frontend de SaludYA puede llamar a la API desde un navegador. Sin
# cookies (la sesión va en el encabezado Authorization), así que no hace
# falta allow_credentials; y solo los métodos y encabezados que se usan.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Verificacion"],
    max_age=600,
)

# Cabeceras de seguridad en todas las respuestas (OWASP Secure Headers):
CABECERAS_SEGURIDAD = {
    "X-Content-Type-Options": "nosniff",  # el navegador no "adivina" el tipo de archivo
    "X-Frame-Options": "DENY",  # nadie puede meter la API en un iframe (clickjacking)
    "Referrer-Policy": "no-referrer",  # no se filtran URLs a otros sitios
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    # Las respuestas traen datos personales y de salud: que no queden guardadas
    # en la caché del navegador ni de un proxy.
    "Cache-Control": "no-store",
}
# La API solo devuelve JSON: no debe poder ejecutar ni cargar nada.
_CSP_API = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
_RUTAS_DOCS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def cabeceras_de_seguridad(request: Request, call_next):
    respuesta = await call_next(request)
    for nombre, valor in CABECERAS_SEGURIDAD.items():
        respuesta.headers.setdefault(nombre, valor)
    if not request.url.path.startswith(_RUTAS_DOCS):  # Swagger necesita cargar sus scripts
        respuesta.headers.setdefault("Content-Security-Policy", _CSP_API)
    if request.url.scheme == "https":
        # Con HTTPS, el navegador ya no vuelve a intentar por HTTP (sin cifrar) durante un año.
        respuesta.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return respuesta

app.include_router(health.router, tags=["Health"])
app.include_router(eps.router, tags=["EPS"])
app.include_router(pacientes.router, tags=["Pacientes"])
app.include_router(auth.router)
app.include_router(catalogo.router)
app.include_router(citas.router)
app.include_router(lista_espera.router)
app.include_router(solicitudes.router)
app.include_router(chat.router)
app.include_router(admin.router)


@app.get("/")
def root():
    # Sin el entorno ni versiones: no se le dan pistas a quien explora la API.
    return {"message": "SaludYA API está funcionando"}
