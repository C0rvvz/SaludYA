"""Registro e ingreso del paciente con código por WhatsApp — HU-01 a HU-08."""

import time

import pytest

from app.core import security
from app.core.config import settings
from app.integrations.notificaciones import enviar_por_canal
from app.integrations.whatsapp.client import enviar_mensaje_whatsapp
from app.models import CodigoOTP, Paciente
from app.models.cita import CanalContacto
from app.services import otp_service
from tests.conftest import encabezado


def _registro(fabrica, **cambios) -> dict:
    datos = {
        "tipo_documento": "cedula_ciudadania",
        "numero_documento": "1098765432",
        "nombre": "Laura Gómez",
        "telefono_whatsapp": "300 123 4567",
        "correo": "laura@ejemplo.com",
        "eps_id": str(fabrica.eps.id),
        "acepto_tratamiento_datos": True,
    }
    return datos | cambios


def _ultimo_codigo(codigos_otp, numero_documento: str) -> str:
    return codigos_otp[numero_documento]


def test_registro_e_ingreso_completo(cliente, fabrica, db, codigos_otp):
    r = cliente.post("/pacientes/registro", json=_registro(fabrica))
    assert r.status_code == 201, r.text
    assert r.json()["telefono_whatsapp"] == "3001234567"  # sin espacios

    r = cliente.post("/auth/paciente/identificar", json={"numero_documento": "1098765432"})
    assert r.status_code == 200
    # Sin el nombre: si no, cualquiera vería el nombre de quien tenga ese documento.
    assert "Laura" not in r.text

    r = cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": "1098765432"})
    assert r.status_code == 201
    assert r.json()["telefono_enmascarado"] == "******4567"  # HU-02, criterio 4

    codigo = _ultimo_codigo(codigos_otp, "1098765432")
    r = cliente.post("/auth/paciente/otp/validar", json={"numero_documento": "1098765432", "codigo": codigo})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]

    r = cliente.get("/auth/paciente/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["numero_documento"] == "1098765432"
    assert r.json()["eps"] == fabrica.eps.nombre  # el encabezado muestra la EPS


def test_codigo_incorrecto_no_da_acceso(cliente, fabrica, db, codigos_otp):
    paciente = fabrica.paciente()
    cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    codigo = _ultimo_codigo(codigos_otp, paciente.numero_documento)
    incorrecto = "000000" if codigo != "000000" else "111111"

    r = cliente.post(
        "/auth/paciente/otp/validar",
        json={"numero_documento": paciente.numero_documento, "codigo": incorrecto},
    )
    assert r.status_code == 400
    assert "access_token" not in r.json()


def test_no_permite_reenviar_el_codigo_enseguida(cliente, fabrica):
    paciente = fabrica.paciente()
    cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    r = cliente.post("/auth/paciente/otp/reenviar", json={"numero_documento": paciente.numero_documento})
    assert r.status_code == 429  # HU-04: hay que esperar antes de pedir otro


def test_documento_no_registrado(cliente):
    r = cliente.post("/auth/paciente/identificar", json={"numero_documento": "9999999999"})
    assert r.status_code == 404  # HU-01, criterio 4


def test_registro_exige_aceptar_tratamiento_de_datos(cliente, fabrica):
    r = cliente.post("/pacientes/registro", json=_registro(fabrica, acepto_tratamiento_datos=False))
    assert r.status_code == 422  # HU-07, criterio 4


def test_registro_valida_celular_colombiano(cliente, fabrica):
    r = cliente.post("/pacientes/registro", json=_registro(fabrica, telefono_whatsapp="2001234567"))
    assert r.status_code == 422


def test_no_permite_registrar_dos_veces_el_mismo_documento(cliente, fabrica):
    assert cliente.post("/pacientes/registro", json=_registro(fabrica)).status_code == 201
    r = cliente.post("/pacientes/registro", json=_registro(fabrica, nombre="Otra Persona"))
    assert r.status_code == 409


def test_registro_sin_eps_como_particular(cliente, fabrica, db):
    # eps_id null (explícito): no tiene EPS y se atiende con médicos particulares.
    r = cliente.post("/pacientes/registro", json=_registro(fabrica, eps_id=None))
    assert r.status_code == 201, r.text
    assert r.json()["eps"] is None and r.json()["estado_afiliacion"] == "particular"
    assert "particular" in r.json()["mensaje"] and "costo" in r.json()["mensaje"]
    paciente = db.query(Paciente).filter_by(numero_documento="1098765432").one()
    me = cliente.get("/auth/paciente/me", headers=encabezado(paciente)).json()
    assert me["eps"] is None and me["particular"] is True

    # Sin el campo no se registra como particular por descuido: hay que decirlo.
    datos = _registro(fabrica, numero_documento="1098765433")
    del datos["eps_id"]
    assert cliente.post("/pacientes/registro", json=datos).status_code == 422


def test_rutas_protegidas_exigen_sesion(cliente):
    assert cliente.get("/citas").status_code in (401, 403)
    assert cliente.get("/citas", headers={"Authorization": "Bearer token-falso"}).status_code == 401


# --- Modo demostración: el código se muestra en pantalla solo con WhatsApp simulado y en desarrollo ---

def _pedir_codigo(cliente, paciente):
    r = cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    assert r.status_code == 201
    return r.json()["codigo_demo"]


def test_modo_demostracion_devuelve_el_codigo(cliente, fabrica, db, monkeypatch, codigos_otp):
    monkeypatch.setattr(settings, "whatsapp_mode", "mock")
    monkeypatch.setattr(settings, "app_env", "development")
    paciente = fabrica.paciente()
    assert _pedir_codigo(cliente, paciente) == _ultimo_codigo(codigos_otp, paciente.numero_documento)


@pytest.mark.parametrize("modo, entorno", [("real", "development"), ("mock", "production")])
def test_fuera_del_modo_demostracion_el_codigo_no_se_muestra(cliente, fabrica, monkeypatch, modo, entorno):
    monkeypatch.setattr(settings, "whatsapp_mode", modo)
    monkeypatch.setattr(settings, "app_env", entorno)
    # El envío real no sale a internet: solo importa lo que responde la API.
    monkeypatch.setattr(otp_service, "enviar_mensaje_whatsapp", lambda telefono, mensaje: True)
    assert _pedir_codigo(cliente, fabrica.paciente()) is None


# --- HU-03 / HU-04: errores del código de verificación ---

def _validar(cliente, paciente, codigo):
    return cliente.post(
        "/auth/paciente/otp/validar", json={"numero_documento": paciente.numero_documento, "codigo": codigo}
    )


def test_codigo_vencido(cliente, fabrica, db, codigos_otp):
    from datetime import datetime, timedelta, timezone

    paciente = fabrica.paciente()
    cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    otp = db.query(CodigoOTP).filter_by(paciente_id=paciente.id).one()
    otp.expira_en = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    codigo = codigos_otp[paciente.numero_documento]
    r = _validar(cliente, paciente, codigo)
    assert r.status_code == 400
    assert "venció" in r.json()["detail"]  # HU-02, criterio 2: código temporal
    assert _validar(cliente, paciente, codigo).status_code == 400  # ya no hay código pendiente


def test_tres_intentos_fallidos_invalidan_el_codigo(cliente, fabrica, db, codigos_otp):
    paciente = fabrica.paciente()
    assert _validar(cliente, paciente, "123456").status_code == 400  # todavía no pidió código
    cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    codigo = _ultimo_codigo(codigos_otp, paciente.numero_documento)
    incorrecto = "000000" if codigo != "000000" else "111111"

    assert _validar(cliente, paciente, incorrecto).status_code == 400
    assert _validar(cliente, paciente, incorrecto).status_code == 400
    assert _validar(cliente, paciente, incorrecto).status_code == 429
    assert _validar(cliente, paciente, codigo).status_code == 400  # invalidado: hay que pedir otro


def test_el_pin_se_envia_en_menos_de_5_segundos_y_si_falla_se_avisa(cliente, fabrica, db, monkeypatch):
    """RNF-22: el PIN se genera y se envía en menos de 5 s; si WhatsApp no responde, se avisa."""
    paciente = fabrica.paciente()
    datos = {"numero_documento": paciente.numero_documento}
    monkeypatch.setattr(otp_service, "enviar_mensaje_whatsapp", lambda *a: False)
    r = cliente.post("/auth/paciente/otp/enviar", json=datos)
    assert r.status_code == 503
    assert "No pudimos enviarle el código" in r.json()["detail"]
    assert db.query(CodigoOTP).filter_by(paciente_id=paciente.id).count() == 0  # no quedó un código que no llegó

    monkeypatch.undo()
    empezo = time.monotonic()
    r = cliente.post("/auth/paciente/otp/enviar", json=datos)  # sin esperar el minuto entre envíos
    assert r.status_code == 201, r.text
    assert time.monotonic() - empezo < 5


def test_reenviar_genera_un_codigo_nuevo(cliente, fabrica, db, monkeypatch):
    paciente = fabrica.paciente()
    monkeypatch.setattr(settings, "otp_reenvio_segundos", 0)
    cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    r = cliente.post("/auth/paciente/otp/reenviar", json={"numero_documento": paciente.numero_documento})
    assert r.status_code == 201
    assert r.json()["reenviado"] is True  # HU-04, criterio 4


def test_documento_no_registrado_en_cada_paso(cliente, fabrica):
    datos = {"numero_documento": "9999999998"}
    assert cliente.post("/auth/paciente/otp/enviar", json=datos).status_code == 404
    assert cliente.post("/auth/paciente/otp/reenviar", json=datos).status_code == 404
    assert cliente.post("/auth/paciente/otp/validar", json=datos | {"codigo": "123456"}).status_code == 404
    r = cliente.post("/pacientes/registro", json=_registro(fabrica, eps_id=str(fabrica.especialidad_id)))
    assert r.status_code == 404  # EPS inexistente


def test_en_la_base_queda_la_huella_del_codigo_no_el_codigo(cliente, fabrica, db, codigos_otp):
    """Quien lea la base no puede entrar con un código vigente."""
    paciente = fabrica.paciente()
    cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    codigo = codigos_otp[paciente.numero_documento]
    guardado = db.query(CodigoOTP).filter_by(paciente_id=paciente.id).one().codigo_hash
    assert len(guardado) == 64 and codigo not in guardado
    assert guardado == security.huella_otp(paciente.id, codigo)
    assert guardado != security.huella_otp(fabrica.paciente().id, codigo)  # atada al paciente
    assert _validar(cliente, paciente, codigo).status_code == 200


def test_fuera_de_desarrollo_el_log_no_guarda_los_mensajes_simulados(fabrica, monkeypatch, caplog):
    paciente = fabrica.paciente()
    monkeypatch.setattr(settings, "app_env", "production")
    enviar_por_canal(paciente, CanalContacto.SMS, "Su código de SaludYA es 482913.")
    enviar_mensaje_whatsapp(paciente.telefono_whatsapp, "Su cita de Psiquiatría es mañana.")
    assert "482913" not in caplog.text and "Psiquiatría" not in caplog.text
    assert "caracteres" in caplog.text

    monkeypatch.setattr(settings, "app_env", "development")  # en desarrollo sí, para ver qué llegaría
    enviar_por_canal(paciente, CanalContacto.SMS, "Su código de SaludYA es 482913.")
    assert "482913" in caplog.text
