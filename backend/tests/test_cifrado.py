"""Cifrado de los datos médicos en la base de datos — RNF-23 (AES-256-GCM)."""

import base64
import secrets
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.core import cifrado
from app.core.cifrado import PREFIJO, DatoCifradoInvalidoError, cifrar, descifrar
from app.core.config import Settings, settings
from app.models.personal import RolPersonal
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado


@pytest.fixture
def llaves_limpias():
    """Las llaves se leen una vez (lru_cache): al cambiarlas en una prueba hay que volver a leerlas."""
    cifrado._llaves.cache_clear()
    yield
    cifrado._llaves.cache_clear()


def _llave() -> str:
    return base64.b64encode(secrets.token_bytes(32)).decode()


def test_cifra_con_aes_gcm_y_cada_vez_distinto():
    a, b = cifrar("Dolor en el pecho al subir escaleras", "observaciones.texto"), cifrar(
        "Dolor en el pecho al subir escaleras", "observaciones.texto"
    )
    assert a.startswith(PREFIJO) and a != b  # nonce aleatorio: el mismo texto nunca se ve igual
    assert "Dolor" not in a
    assert descifrar(a, "observaciones.texto") == descifrar(b, "observaciones.texto") == (
        "Dolor en el pecho al subir escaleras"
    )


def test_detecta_alteraciones_y_valores_movidos_de_columna():
    valor = cifrar("Control de migraña", "solicitudes_cita.motivo")
    alterado = valor[:-6] + ("A" if valor[-6] != "A" else "B") + valor[-5:]
    with pytest.raises(DatoCifradoInvalidoError):
        descifrar(alterado, "solicitudes_cita.motivo")
    with pytest.raises(DatoCifradoInvalidoError):  # copiado a otra columna: no se descifra
        descifrar(valor, "observaciones.texto")
    assert descifrar("Texto guardado antes de cifrar", "observaciones.texto") == "Texto guardado antes de cifrar"


def test_cambiar_la_llave_sin_perder_lo_guardado(monkeypatch, llaves_limpias):
    vieja, nueva = _llave(), _llave()
    monkeypatch.setattr(settings, "clave_cifrado_datos", vieja)
    guardado = cifrar("Alergia a la penicilina", "observaciones.texto")

    cifrado._llaves.cache_clear()
    monkeypatch.setattr(settings, "clave_cifrado_datos", nueva)
    with pytest.raises(DatoCifradoInvalidoError):  # sin la anterior, ya no se puede leer
        descifrar(guardado, "observaciones.texto")

    cifrado._llaves.cache_clear()
    monkeypatch.setattr(settings, "claves_cifrado_anteriores", vieja)
    assert descifrar(guardado, "observaciones.texto") == "Alergia a la penicilina"
    nuevo = cifrar("Otro dato", "observaciones.texto")
    monkeypatch.setattr(settings, "claves_cifrado_anteriores", "")
    cifrado._llaves.cache_clear()
    assert descifrar(nuevo, "observaciones.texto") == "Otro dato"  # lo nuevo ya va con la llave nueva


def test_fuera_de_desarrollo_la_llave_es_obligatoria_y_de_256_bits():
    base = {"database_url": "postgresql://x", "jwt_secret": "x" * 40, "turnstile_secret": "t", "app_env": "production"}
    with pytest.raises(ValueError, match="CLAVE_CIFRADO_DATOS"):
        Settings(**base, clave_cifrado_datos="")
    with pytest.raises(ValueError, match="32 bytes"):
        Settings(**base, clave_cifrado_datos=base64.b64encode(b"corta").decode())
    assert Settings(**base, clave_cifrado_datos=_llave()).clave_cifrado_datos


def test_en_la_base_quedan_cifrados_y_la_api_los_muestra_legibles(cliente, fabrica, db):
    paciente = fabrica.paciente()
    motivo = "Tengo una mancha en el brazo que cambió de color y me preocupa."
    r = cliente.post("/solicitudes", headers=encabezado(paciente), json={
        "tipo": "formal", "especialidad_id": str(fabrica.especialidad_id), "tipo_cita": "primera_vez",
        "fecha_deseada": (hoy_en_colombia() + timedelta(days=5)).isoformat(), "motivo": motivo, "canal": "whatsapp",
    })
    assert r.status_code == 201, r.text
    admin = fabrica.personal(RolPersonal.ADMINISTRADOR)
    nota = "Paciente con antecedente de melanoma en la familia."
    assert cliente.post(
        f"/admin/pacientes/{paciente.id}/observaciones", headers=encabezado(admin), json={"texto": nota}
    ).status_code in (200, 201)

    crudos = [
        db.execute(text("SELECT motivo FROM solicitudes_cita WHERE id = :id"), {"id": r.json()["id"]}).scalar(),
        db.execute(text("SELECT texto FROM observaciones WHERE paciente_id = :id"), {"id": paciente.id}).scalar(),
        *db.execute(text("SELECT detalle FROM auditoria WHERE paciente_id = :id AND detalle IS NOT NULL"),
                    {"id": paciente.id}).scalars(),
    ]
    assert crudos and all(c.startswith(PREFIJO) for c in crudos)
    assert not any("mancha" in c or "melanoma" in c for c in crudos)

    # Quien tiene permiso los ve como siempre.
    assert cliente.get("/solicitudes", headers=encabezado(paciente)).json()[0]["motivo"] == motivo
    auditoria = cliente.get(f"/admin/auditoria?paciente_id={paciente.id}", headers=encabezado(admin)).json()
    assert motivo in [r["detalle"] for r in auditoria]


def test_un_valor_danado_no_tumba_la_pantalla(cliente, fabrica, db):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente)
    db.execute(
        text("UPDATE citas SET motivo_cancelacion = :v WHERE id = :id"),
        {"v": PREFIJO + base64.b64encode(secrets.token_bytes(40)).decode(), "id": cita.id},
    )
    db.commit()
    db.expire_all()
    admin = fabrica.personal()
    r = cliente.get(f"/admin/citas/{cita.id}", headers=encabezado(admin))
    assert r.status_code == 200
    assert r.json()["motivo_cancelacion"] == cifrado.NO_DISPONIBLE
