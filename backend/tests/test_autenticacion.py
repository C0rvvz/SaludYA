"""Registro e ingreso del paciente con código por WhatsApp — HU-01 a HU-08."""

from app.models import CodigoOTP, Paciente


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


def _ultimo_codigo(db, numero_documento: str) -> str:
    paciente = db.query(Paciente).filter_by(numero_documento=numero_documento).one()
    return db.query(CodigoOTP).filter_by(paciente_id=paciente.id).order_by(CodigoOTP.creado_en.desc()).first().codigo


def test_registro_e_ingreso_completo(cliente, fabrica, db):
    r = cliente.post("/pacientes/registro", json=_registro(fabrica))
    assert r.status_code == 201, r.text
    assert r.json()["telefono_whatsapp"] == "3001234567"  # sin espacios

    r = cliente.post("/auth/paciente/identificar", json={"numero_documento": "1098765432"})
    assert r.status_code == 200
    assert r.json()["nombre"] == "Laura Gómez"

    r = cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": "1098765432"})
    assert r.status_code == 201
    assert r.json()["telefono_enmascarado"] == "******4567"  # HU-02, criterio 4

    codigo = _ultimo_codigo(db, "1098765432")
    r = cliente.post("/auth/paciente/otp/validar", json={"numero_documento": "1098765432", "codigo": codigo})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]

    r = cliente.get("/auth/paciente/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["numero_documento"] == "1098765432"


def test_codigo_incorrecto_no_da_acceso(cliente, fabrica, db):
    paciente = fabrica.paciente()
    cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    codigo = _ultimo_codigo(db, paciente.numero_documento)
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


def test_rutas_protegidas_exigen_sesion(cliente):
    assert cliente.get("/citas").status_code in (401, 403)
    assert cliente.get("/citas", headers={"Authorization": "Bearer token-falso"}).status_code == 401
