"""
Servidor de producción: la página (el frontend ya compilado) y la API en
una sola dirección.

La API queda en /api, igual que con el proxy de Vite en desarrollo: el
frontend no cambia y no hace falta CORS. Todo lo demás es la página; las
rutas de React (/mis-citas, /admin/...) devuelven index.html para que las
resuelva el navegador.

En desarrollo se sigue usando app.main:app (la API sola, con Vite aparte).
El Dockerfile de la raíz del proyecto arranca este servidor.
"""

import html
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles

from app.core.config import settings
from app.main import app as api

# Donde el Dockerfile deja el frontend compilado (npm run build).
CARPETA_WEB = Path(__file__).resolve().parents[1] / "web"

# Lo que la página puede cargar: sus propios archivos, la casilla "No soy
# un robot" (Cloudflare), la letra (Google Fonts) y las fotos (Unsplash,
# Pexels). Nada más puede ejecutarse en ella.
CSP_PAGINA = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])
CABECERAS_PAGINA = {
    "Content-Security-Policy": CSP_PAGINA,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    # El micrófono, para dictarle a Eli (useDictado.js).
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}
# Solo se publica con HTTPS: el navegador no vuelve a intentar por HTTP
# durante un año. (Por HTTP, como al probar la imagen en este equipo, el
# navegador la ignora.)
HSTS = "max-age=31536000; includeSubDomains"


def _metas(sitekey: str, demostracion: bool) -> str:
    """Datos del servidor que la página lee al cargar (ver utils/entorno.js)."""
    metas = []
    if sitekey:
        metas.append(f'<meta name="saludya:turnstile" content="{html.escape(sitekey)}" />')
    if demostracion:
        metas.append('<meta name="saludya:demostracion" content="1" />')
    return "".join(metas)


class Pagina(StaticFiles):
    """Los archivos del frontend, y index.html para las rutas de React."""

    def __init__(self, carpeta: Path):
        super().__init__(directory=carpeta, check_dir=False)
        self.carpeta = carpeta
        self._index: str | None = None

    def index(self) -> HTMLResponse:
        if self._index is None:
            texto = (self.carpeta / "index.html").read_text(encoding="utf-8")
            metas = _metas(settings.turnstile_sitekey, settings.codigo_otp_en_pantalla)
            self._index = texto.replace("</head>", metas + "</head>", 1)
        # Sin caché: así cada visita carga la última versión publicada.
        return HTMLResponse(self._index, headers={"Cache-Control": "no-cache"})

    async def get_response(self, path: str, scope):
        if path in ("", ".", "index.html"):
            return self.index()
        try:
            respuesta = await super().get_response(path, scope)
        except HTTPException as error:
            # Un archivo que no existe (p. ej. /assets/viejo.js) sigue siendo 404;
            # una ruta sin extensión es una pantalla de React.
            if error.status_code != 404 or "." in path.rsplit("/", 1)[-1]:
                raise
            return self.index()
        if path.startswith("assets/"):
            # Vite les pone una huella en el nombre: si cambian, cambia el nombre.
            respuesta.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            respuesta.headers.setdefault("Cache-Control", "no-cache")
        return respuesta


def crear_servidor(carpeta_web: Path = CARPETA_WEB) -> FastAPI:
    # Sin documentación propia, y con las tareas de fondo de la API
    # (recordatorios, cierre de citas): Starlette no corre el "lifespan" de
    # una aplicación montada, así que se le pasa el de la API.
    servidor = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=api.router.lifespan_context)

    @servidor.middleware("http")
    async def cabeceras(request: Request, call_next):
        respuesta = await call_next(request)
        respuesta.headers.setdefault("Strict-Transport-Security", HSTS)
        if not request.url.path.startswith("/api"):
            for nombre, valor in CABECERAS_PAGINA.items():
                respuesta.headers.setdefault(nombre, valor)
        return respuesta

    servidor.mount("/api", api)
    servidor.mount("/", Pagina(carpeta_web))
    return servidor


app = crear_servidor()
