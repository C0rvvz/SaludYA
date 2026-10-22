"""
Seguridad del ingreso, la sesión y la API:
RNF-17 (sesión única), RNF-24 (cierre por inactividad), límite de intentos
por conexión, política de contraseñas, tokens y cabeceras de seguridad.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import settings
from app.core.security import ALGORITHM, EMISOR, TIPO_PERSONAL, crear_access_token
from app.models import Sesion
from app.models.personal import RolPersonal
from app.services import personal_service
from app.services.exceptions import PersonalInvalidoError
from tests.conftest import encabezado

CLAVE = "clave-de-prueba-123"  # la que usa la fábrica


def _login(cliente, correo, password=CLAVE):
    return cliente.post("/admin/auth/login", json={"correo": correo, "password": password})


def _con(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- RNF-17: una sola sesión a la vez ---

def test_una_sesion_nueva_cierra_la_anterior(cliente, fabrica, db):
    persona = fabrica.personal(RolPersonal.CALL_CENTER)
    primera = _login(cliente, persona.correo).json()["access_token"]
    assert cliente.get("/admin/auth/me", headers=_con(primera)).status_code == 200

    segunda = _login(cliente, persona.correo).json()["access_token"]  # otra pestaña o dispositivo
    r = cliente.get("/admin/auth/me", headers=_con(primera))
    assert r.status_code == 401
    assert "otra pestaña o dispositivo" in r.json()["detail"]
    assert cliente.get("/admin/auth/me", headers=_con(segunda)).status_code == 200

    sesiones = db.query(Sesion).filter_by(sujeto_id=persona.id).order_by(Sesion.creada_en).all()
    assert [s.motivo_cierre for s in sesiones] == ["otra_sesion", None]
    assert sesiones[0].ip == "testclient"  # registro de accesos: desde dónde


def test_sesion_unica_del_paciente(cliente, fabrica, db, monkeypatch):
    from app.models import CodigoOTP

    monkeypatch.setattr(settings, "otp_reenvio_segundos", 0)
    paciente = fabrica.paciente()
    documento = {"numero_documento": paciente.numero_documento}

    def ingresar() -> str:
        cliente.post("/auth/paciente/otp/enviar", json=documento)
        codigo = db.query(CodigoOTP).filter_by(paciente_id=paciente.id).order_by(CodigoOTP.creado_en.desc()).first()
        r = cliente.post("/auth/paciente/otp/validar", json=documento | {"codigo": codigo.codigo})
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    primera = ingresar()
    segunda = ingresar()
    assert cliente.get("/citas", headers=_con(primera)).status_code == 401
    assert cliente.get("/citas", headers=_con(segunda)).status_code == 200


# --- RNF-24: inactividad ---

def test_la_sesion_se_cierra_tras_2_minutos_sin_actividad(cliente, fabrica, db):
    persona = fabrica.personal()
    token = _login(cliente, persona.correo).json()["access_token"]
    sesion = db.query(Sesion).filter_by(sujeto_id=persona.id).one()

    sesion.ultima_actividad_en = datetime.now(timezone.utc) - timedelta(seconds=100)
    db.commit()
    assert cliente.get("/admin/auth/me", headers=_con(token)).status_code == 200  # 1:40 sin uso: sigue
    db.refresh(sesion)
    assert datetime.now(timezone.utc) - sesion.ultima_actividad_en < timedelta(seconds=5)  # actividad al día

    sesion.ultima_actividad_en = datetime.now(timezone.utc) - timedelta(minutes=2, seconds=1)
    db.commit()
    r = cliente.get("/admin/auth/me", headers=_con(token))
    assert r.status_code == 401
    assert "2 minutos sin actividad" in r.json()["detail"]
    db.refresh(sesion)
    assert sesion.motivo_cierre == "inactividad"
    assert cliente.get("/admin/auth/me", headers=_con(token)).status_code == 401  # ya no revive


# --- Cerrar sesión de verdad ---

def test_salir_invalida_el_token(cliente, fabrica):
    persona = fabrica.personal()
    token = _login(cliente, persona.correo).json()["access_token"]
    assert cliente.post("/admin/auth/salir", headers=_con(token)).status_code == 204
    assert cliente.get("/admin/auth/me", headers=_con(token)).status_code == 401

    paciente = fabrica.paciente()
    encabezados = encabezado(paciente)
    assert cliente.post("/auth/paciente/salir", headers=encabezados).status_code == 204
    assert cliente.get("/auth/paciente/me", headers=encabezados).status_code == 401


def test_modificar_la_cuenta_cierra_sus_sesiones(cliente, fabrica):
    admin = fabrica.personal()
    persona = fabrica.personal(RolPersonal.CALL_CENTER)
    token = _login(cliente, persona.correo).json()["access_token"]

    r = cliente.patch(f"/admin/usuarios/{persona.id}", headers=encabezado(admin), json={"rol": "agendamiento"})
    assert r.status_code == 200
    r = cliente.get("/admin/auth/me", headers=_con(token))
    assert r.status_code == 401
    assert "modificada por un administrador" in r.json()["detail"]

    # Cambiar solo el nombre no le cierra la sesión.
    token = _login(cliente, persona.correo).json()["access_token"]
    cliente.patch(f"/admin/usuarios/{persona.id}", headers=encabezado(admin), json={"nombre": "Otro Nombre"})
    assert cliente.get("/admin/auth/me", headers=_con(token)).status_code == 200

    cliente.patch(f"/admin/usuarios/{persona.id}", headers=encabezado(admin), json={"activo": False})
    assert cliente.get("/admin/auth/me", headers=_con(token)).status_code == 401


# --- Tokens ---

def test_tokens_alterados_o_sin_sesion_no_sirven(cliente, fabrica):
    persona = fabrica.personal()
    token = _login(cliente, persona.correo).json()["access_token"]
    datos = jwt.decode(token, options={"verify_signature": False})

    # Firmado con otra llave (alguien que intenta fabricar su propio token).
    falso = jwt.encode(datos, "otra-llave-que-no-es-la-del-servidor-1234567", algorithm=ALGORITHM)
    # Sin firma ("alg": "none").
    sin_firma = jwt.encode(datos, key=None, algorithm="none")
    # Bien firmado, pero sin sesión del servidor.
    sin_sesion = jwt.encode({k: v for k, v in datos.items() if k != "sid"}, settings.jwt_secret, algorithm=ALGORITHM)
    # Bien firmado, con una sesión que no existe.
    sesion_inventada, _ = crear_access_token(persona.id, uuid.uuid4(), rol="administrador", tipo=TIPO_PERSONAL)
    # Un rol inventado en el token no da más permisos: el rol sale de la base de datos.
    otro_emisor = jwt.encode(datos | {"iss": "otro"}, settings.jwt_secret, algorithm=ALGORITHM)

    for malo in (falso, sin_firma, sin_sesion, sesion_inventada, otro_emisor):
        assert cliente.get("/admin/auth/me", headers=_con(malo)).status_code == 401
    assert datos["iss"] == EMISOR


def test_el_token_del_paciente_no_sirve_con_la_sesion_de_otro(cliente, fabrica):
    paciente, otro = fabrica.paciente(), fabrica.paciente()
    sid = jwt.decode(encabezado(otro)["Authorization"][7:], options={"verify_signature": False})["sid"]
    mezclado, _ = crear_access_token(paciente.id, uuid.UUID(sid))
    assert cliente.get("/auth/paciente/me", headers=_con(mezclado)).status_code == 401


# --- Fuerza bruta: límite de intentos por conexión ---

def test_limite_de_intentos_al_identificar_documentos(cliente):
    for i in range(10):
        r = cliente.post("/auth/paciente/identificar", json={"numero_documento": f"90000000{i:02d}"})
        assert r.status_code == 404
    r = cliente.post("/auth/paciente/identificar", json={"numero_documento": "9000000099"})
    assert r.status_code == 429
    assert "Demasiados intentos" in r.json()["detail"]


def test_limite_de_intentos_al_ingresar_como_personal(cliente):
    # Probando correos distintos, el bloqueo por cuenta no lo frena; el de la conexión, sí.
    for i in range(10):
        assert _login(cliente, f"persona{i}@saludya.test", "clave-equivocada-1").status_code == 401
    assert _login(cliente, "persona-11@saludya.test", "clave-equivocada-1").status_code == 429


# --- Contraseñas del personal ---

@pytest.mark.parametrize(
    "clave, motivo",
    [
        ("corta-12", "al menos 12"),
        ("solo-letras-sin-numeros", "letras y números"),
        ("123456789012345", "letras y números"),
        ("Password1234", "fácil de adivinar"),
        ("marta.lopez-2026", "fácil de adivinar"),  # contiene el usuario del correo
    ],
)
def test_politica_de_contrasenas(db, fabrica, clave, motivo):
    with pytest.raises(PersonalInvalidoError, match=motivo):
        personal_service.crear(db, "Marta López", "marta.lopez@saludya.test", RolPersonal.AGENDAMIENTO, clave)


def test_contrasena_valida(db):
    persona = personal_service.crear(db, "Marta López", "marta@saludya.test", RolPersonal.AGENDAMIENTO, "Turno-noche-2026")
    assert persona.password_hash.startswith("scrypt$")  # nunca se guarda la contraseña


# --- Cabeceras de seguridad ---

def test_cabeceras_de_seguridad(cliente):
    r = cliente.get("/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "no-referrer"
    assert r.headers["Cache-Control"] == "no-store"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert cliente.get("/").json() == {"message": "SaludYA API está funcionando"}  # sin datos del entorno


def test_cors_solo_para_el_frontend(cliente):
    permitido = settings.cors_origins_list[0]
    r = cliente.options(
        "/citas", headers={"Origin": permitido, "Access-Control-Request-Method": "GET"}
    )
    assert r.headers.get("access-control-allow-origin") == permitido
    r = cliente.options(
        "/citas", headers={"Origin": "https://sitio-malicioso.example", "Access-Control-Request-Method": "GET"}
    )
    assert "access-control-allow-origin" not in r.headers
