"""
Versión publicada en internet: el servidor que entrega la página y la API
juntas (app/servidor.py) y la configuración de producción.
"""

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.core import limite_intentos
from app.core.config import Settings, settings
from app.servidor import CSP_PAGINA, crear_servidor

INDEX = "<!doctype html><html><head><title>SaludYA</title></head><body></body></html>"


@pytest.fixture
def carpeta_web(tmp_path):
    (tmp_path / "index.html").write_text(INDEX, encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log('SaludYA')", encoding="utf-8")
    (tmp_path / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")
    return tmp_path


@pytest.fixture
def servidor(carpeta_web, cliente):  # `cliente`: la API usa la base de la prueba
    return TestClient(crear_servidor(carpeta_web))


def test_entrega_la_pagina_y_las_rutas_de_react(servidor):
    for ruta in ["/", "/mis-citas", "/admin/citas/15", "/pagar/resultado/SY-123"]:
        r = servidor.get(ruta)
        assert r.status_code == 200, ruta
        assert "<title>SaludYA</title>" in r.text
        assert r.headers["cache-control"] == "no-cache"
        assert r.headers["content-security-policy"] == CSP_PAGINA
        assert r.headers["x-frame-options"] == "DENY"


def test_los_archivos_de_la_pagina(servidor):
    r = servidor.get("/assets/index-abc123.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert servidor.get("/favicon.svg").headers["cache-control"] == "no-cache"
    # Un archivo que no existe no se confunde con una pantalla.
    assert servidor.get("/assets/index-viejo.js").status_code == 404


def test_la_api_queda_en_api(servidor):
    r = servidor.get("/api/health")
    assert r.status_code == 200
    assert r.json()["database"] == "ok"
    # Con las cabeceras de la API (solo JSON, sin caché), no las de la página.
    assert r.headers["content-security-policy"].startswith("default-src 'none'")
    assert r.headers["cache-control"] == "no-store"
    assert "strict-transport-security" in r.headers
    assert servidor.get("/api/eps").status_code == 200
    # El servidor no agrega su propio /docs (el de la API se apaga fuera de desarrollo, en main.py).
    assert servidor.get("/docs").text.startswith("<!doctype html>")


def test_le_pasa_a_la_pagina_la_llave_y_el_modo_demostracion(carpeta_web, cliente, monkeypatch):
    monkeypatch.setattr(settings, "turnstile_sitekey", 'llave"<x>')
    monkeypatch.setattr(settings, "modo_demostracion", True)
    monkeypatch.setattr(settings, "app_env", "production")
    texto = TestClient(crear_servidor(carpeta_web)).get("/").text
    assert '<meta name="saludya:turnstile" content="llave&quot;&lt;x&gt;" />' in texto
    assert '<meta name="saludya:demostracion" content="1" />' in texto


def test_sin_demostracion_la_pagina_no_lo_anuncia(carpeta_web, cliente, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "modo_demostracion", False)
    texto = TestClient(crear_servidor(carpeta_web)).get("/").text
    assert "saludya:" not in texto


def _produccion(**cambios) -> Settings:
    valores = {
        "database_url": "postgresql://u:c@servidor/base",
        "jwt_secret": "x" * 40,
        "app_env": "production",
        "turnstile_secret": "secreta",
        "clave_cifrado_datos": "A" * 43 + "=",
        **cambios,
    }
    return Settings(_env_file=None, **valores)


def test_modo_demostracion_muestra_el_codigo_solo_con_whatsapp_simulado():
    assert not _produccion(whatsapp_mode="mock").codigo_otp_en_pantalla
    assert _produccion(whatsapp_mode="mock", modo_demostracion=True).codigo_otp_en_pantalla
    assert not _produccion(whatsapp_mode="real", modo_demostracion=True).codigo_otp_en_pantalla


def test_acepta_la_direccion_de_la_base_como_la_entregan_los_servicios():
    assert _produccion(database_url="postgres://u:c@ep-1.neon.tech/neondb?sslmode=require").database_url == (
        "postgresql://u:c@ep-1.neon.tech/neondb?sslmode=require"
    )


def test_en_render_el_enlace_de_los_recordatorios_usa_su_direccion_publica(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://saludya.onrender.com")
    assert _produccion().frontend_url == "https://saludya.onrender.com"
    monkeypatch.setenv("FRONTEND_URL", "https://saludya.co")
    assert _produccion().frontend_url == "https://saludya.co"


def _peticion(cabeceras: dict) -> Request:
    return Request({
        "type": "http",
        "headers": [(k.encode(), v.encode()) for k, v in cabeceras.items()],
        "client": ("10.0.0.7", 51000),  # el proxy
    })


def test_detras_del_proxy_cada_visitante_tiene_su_ip(monkeypatch):
    peticion = _peticion({"cf-connecting-ip": "181.50.1.2", "x-forwarded-for": "1.1.1.1"})
    # Sin configurar, la de la conexión: nunca la de una cabecera que puede escribir cualquiera.
    assert limite_intentos.ip_de(peticion) == "10.0.0.7"

    monkeypatch.setattr(settings, "cabecera_ip_cliente", "cf-connecting-ip")
    assert limite_intentos.ip_de(peticion) == "181.50.1.2"
    assert limite_intentos.ip_de(_peticion({})) == "10.0.0.7"
