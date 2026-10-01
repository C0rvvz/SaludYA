"""Envío real por WhatsApp Cloud API (sin salir a internet: se intercepta la llamada a Meta)."""

import json

import httpx
import pytest

from app.core.config import settings
from app.integrations.whatsapp import client
from app.integrations.whatsapp.client import enviar_mensaje_whatsapp, formato_internacional


@pytest.mark.parametrize(
    "telefono, esperado",
    [
        ("3001234567", "573001234567"),  # celular colombiano, como se guarda al registrarse
        ("300 123 4567", "573001234567"),
        ("573001234567", "573001234567"),  # ya trae el indicativo
        ("+57 300 123 4567", "573001234567"),
    ],
)
def test_formato_internacional(telefono, esperado):
    assert formato_internacional(telefono) == esperado


@pytest.fixture
def meta(monkeypatch):
    """Modo real con credenciales de prueba; guarda lo que se le habría enviado a Meta."""
    monkeypatch.setattr(settings, "whatsapp_mode", "real")
    monkeypatch.setattr(settings, "whatsapp_access_token", "token-de-prueba")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "123456789")
    enviados = []
    respuesta = {"codigo": 200}

    def responder(request: httpx.Request) -> httpx.Response:
        enviados.append(request)
        return httpx.Response(respuesta["codigo"], json={"error": {"message": "Recipient not in allowed list"}})

    cliente_real = httpx.Client
    monkeypatch.setattr(
        client.httpx, "Client", lambda **kw: cliente_real(transport=httpx.MockTransport(responder), **kw)
    )
    return enviados, respuesta


def test_envio_real_a_la_api_de_meta(meta):
    enviados, _ = meta
    assert enviar_mensaje_whatsapp("3001234567", "Su código es 123456") is True

    (peticion,) = enviados
    assert str(peticion.url) == f"https://graph.facebook.com/{settings.whatsapp_api_version}/123456789/messages"
    assert peticion.headers["Authorization"] == "Bearer token-de-prueba"
    cuerpo = json.loads(peticion.content)
    assert cuerpo["to"] == "573001234567"
    assert cuerpo["text"] == {"body": "Su código es 123456"}


def test_error_de_meta_queda_en_el_log(meta, caplog):
    _, respuesta = meta
    respuesta["codigo"] = 400
    assert enviar_mensaje_whatsapp("3001234567", "Hola") is False
    assert "Recipient not in allowed list" in caplog.text


def test_modo_real_sin_credenciales_no_envia(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_mode", "real")
    monkeypatch.setattr(settings, "whatsapp_access_token", "")
    assert enviar_mensaje_whatsapp("3001234567", "Hola") is False
