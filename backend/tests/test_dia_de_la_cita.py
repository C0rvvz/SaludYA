"""El día de la consulta — HU-23 (enlace del recordatorio), HU-24 (llegada) y HU-25 (cierre)."""

from datetime import timedelta

from app.models.cita import EstadoCita
from app.models.personal import RolPersonal
from app.services import citas_service
from app.utils.tiempo import ahora_colombia
from tests.conftest import encabezado


def _cita_a(fabrica, paciente, minutos: int, estado: EstadoCita = EstadoCita.CONFIRMADA):
    """Cita que empieza dentro de `minutos` (negativo: ya empezó)."""
    inicio = (ahora_colombia() + timedelta(minutes=minutos)).replace(second=0, microsecond=0)
    return fabrica.cita(paciente, estado, fecha=inicio.date(), hora=inicio.time())


# --- HU-24: registrar la llegada ---

def test_registrar_la_llegada_dentro_de_la_ventana(cliente, fabrica):
    paciente = fabrica.paciente()
    cita = _cita_a(fabrica, paciente, 30)
    assert cliente.get(f"/citas/{cita.id}", headers=encabezado(paciente)).json()["puede_registrar_llegada"]

    r = cliente.post(f"/citas/{cita.id}/registrar-llegada", headers=encabezado(paciente))
    assert r.status_code == 200, r.text
    assert r.json()["estado_visible"] == "llegada_registrada"
    assert r.json()["asistencia_confirmada_en"] is not None  # la llegada también confirma la asistencia
    assert r.json()["puede_cancelar"] is False

    otra_vez = cliente.post(f"/citas/{cita.id}/registrar-llegada", headers=encabezado(paciente))
    assert otra_vez.json()["llegada_registrada_en"] == r.json()["llegada_registrada_en"]  # queda la primera


def test_no_registra_la_llegada_fuera_de_la_ventana(cliente, fabrica):
    paciente = fabrica.paciente()
    temprano = fabrica.cita(paciente)  # dentro de 10 días
    r = cliente.post(f"/citas/{temprano.id}/registrar-llegada", headers=encabezado(paciente))
    assert r.status_code == 409
    assert "temprano" in r.json()["detail"]

    tarde = _cita_a(fabrica, paciente, -45)
    r = cliente.post(f"/citas/{tarde.id}/registrar-llegada", headers=encabezado(paciente))
    assert r.status_code == 409
    assert "ya pasó" in r.json()["detail"]

    cancelada = fabrica.cita(paciente, EstadoCita.CANCELADA)
    assert cliente.post(f"/citas/{cancelada.id}/registrar-llegada", headers=encabezado(paciente)).status_code == 409


# --- HU-23: confirmar desde el enlace del recordatorio, sin sesión ---

def test_confirmar_por_enlace(cliente, fabrica):
    cita = fabrica.cita(fabrica.paciente())
    token = citas_service.token_de_confirmacion(cita)

    r = cliente.post("/citas/confirmar-asistencia/enlace", json={"token": token})
    assert r.status_code == 200, r.text
    assert r.json()["ya_estaba_confirmada"] is False
    assert "numero_documento" not in r.json()  # respuesta pública: sin datos personales

    otra_vez = cliente.post("/citas/confirmar-asistencia/enlace", json={"token": token})
    assert otra_vez.json()["ya_estaba_confirmada"] is True


def test_enlace_invalido_vencido_o_de_cita_cancelada(cliente, fabrica):
    assert cliente.post("/citas/confirmar-asistencia/enlace", json={"token": "x" * 40}).status_code == 400

    paciente = fabrica.paciente()
    pasada = _cita_a(fabrica, paciente, -10)
    r = cliente.post("/citas/confirmar-asistencia/enlace", json={"token": citas_service.token_de_confirmacion(pasada)})
    assert r.status_code == 400
    assert "venció" in r.json()["detail"]

    cancelada = fabrica.cita(paciente, EstadoCita.CANCELADA)
    token = citas_service.token_de_confirmacion(cancelada)
    assert cliente.post("/citas/confirmar-asistencia/enlace", json={"token": token}).status_code == 409


# --- HU-25: cierre automático y corrección del personal ---

def test_cierre_automatico_de_citas_pasadas(db, fabrica):
    paciente = fabrica.paciente()
    llego = _cita_a(fabrica, paciente, -90)
    llego.llegada_registrada_en = llego.creado_en
    no_llego = _cita_a(fabrica, paciente, -91)
    reciente = _cita_a(fabrica, paciente, -10)  # todavía no pasa el tiempo de cierre
    db.commit()

    assert citas_service.cerrar_citas_pasadas(db) == (1, 1)
    for cita in (llego, no_llego, reciente):
        db.refresh(cita)
    assert (llego.estado, no_llego.estado, reciente.estado) == (
        EstadoCita.ATENDIDA, EstadoCita.NO_ASISTIO, EstadoCita.CONFIRMADA,
    )
    assert citas_service.estado_visible(reciente) == "finalizada"


def test_el_personal_corrige_el_resultado(cliente, fabrica):
    coordinador = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.NO_ASISTIO)

    r = cliente.post(f"/admin/citas/{cita.id}/resultado", headers=encabezado(coordinador), json={"resultado": "atendida"})
    assert r.status_code == 200, r.text
    assert r.json()["estado_visible"] == "atendida"
    igual = cliente.post(f"/admin/citas/{cita.id}/resultado", headers=encabezado(coordinador), json={"resultado": "atendida"})
    assert igual.status_code == 200

    futura = fabrica.cita(paciente)
    r = cliente.post(f"/admin/citas/{futura.id}/resultado", headers=encabezado(coordinador), json={"resultado": "atendida"})
    assert r.status_code == 409  # todavía no empieza

    cancelada = fabrica.cita(paciente, EstadoCita.CANCELADA)
    r = cliente.post(f"/admin/citas/{cancelada.id}/resultado", headers=encabezado(coordinador), json={"resultado": "no_asistio"})
    assert r.status_code == 409


def test_registrar_resultado_solo_admite_atendida_o_no_asistio(db, fabrica):
    import pytest

    from app.services.auditoria_service import SISTEMA
    from app.services.exceptions import ResultadoNoRegistrableError

    cita = fabrica.cita(fabrica.paciente(), EstadoCita.ATENDIDA)
    with pytest.raises(ResultadoNoRegistrableError):
        citas_service.registrar_resultado(db, cita.id, EstadoCita.CANCELADA, actor=SISTEMA)
