"""Agendar y gestionar citas desde "Mis citas" — HU-16 a HU-21, HU-26 a HU-29."""

from datetime import time, timedelta

from app.models.cita import EstadoCita
from app.models.disponibilidad import EstadoDisponibilidad
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado


def _agendar(cliente, paciente, franja):
    return cliente.post(
        "/citas",
        headers=encabezado(paciente),
        json={"disponibilidad_id": str(franja.id), "canal_recordatorio": "whatsapp"},
    )


def test_agendar_genera_comprobante_y_reserva_el_horario(cliente, fabrica, db):
    paciente, franja = fabrica.paciente(), fabrica.franja()

    r = _agendar(cliente, paciente, franja)
    assert r.status_code == 201, r.text
    cita = r.json()
    assert cita["estado"] == "confirmada"
    assert cita["numero_comprobante"]  # HU-17

    db.refresh(franja)
    assert franja.estado == EstadoDisponibilidad.RESERVADO

    r = cliente.get(f"/citas/{cita['id']}/comprobante", headers=encabezado(paciente))
    assert r.status_code == 200
    assert r.json()["paciente_nombre"] == paciente.nombre


def test_no_se_puede_agendar_un_horario_ocupado(cliente, fabrica):
    franja = fabrica.franja()
    assert _agendar(cliente, fabrica.paciente(), franja).status_code == 201
    r = _agendar(cliente, fabrica.paciente(), franja)
    assert r.status_code == 409  # HU-16, criterio 3 / HU-10, criterio 3


def test_no_se_puede_agendar_un_horario_que_ya_paso(cliente, fabrica):
    franja = fabrica.franja(fecha=hoy_en_colombia() - timedelta(days=1))
    assert _agendar(cliente, fabrica.paciente(), franja).status_code == 409


def test_mis_citas_separa_proximas_e_historial(cliente, fabrica):
    paciente = fabrica.paciente()
    proxima = fabrica.cita(paciente)
    pasada = fabrica.cita(paciente, EstadoCita.ATENDIDA, fecha=hoy_en_colombia() - timedelta(days=5))
    de_otro = fabrica.cita(fabrica.paciente())

    proximas = {c["id"] for c in cliente.get("/citas?vista=proximas", headers=encabezado(paciente)).json()}
    historial = {c["id"] for c in cliente.get("/citas?vista=historial", headers=encabezado(paciente)).json()}
    assert proximas == {str(proxima.id)}
    assert historial == {str(pasada.id)}
    assert str(de_otro.id) not in proximas | historial  # HU-28, criterio 4: solo las propias


def test_confirmar_asistencia(cliente, fabrica):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente)

    r = cliente.post(f"/citas/{cita.id}/confirmar-asistencia", headers=encabezado(paciente))
    assert r.status_code == 200
    assert r.json()["estado_visible"] == "asistencia_confirmada"
    assert r.json()["puede_confirmar_asistencia"] is False


def test_cancelar_libera_el_horario_para_otro_paciente(cliente, fabrica):
    paciente, franja = fabrica.paciente(), fabrica.franja()
    cita_id = _agendar(cliente, paciente, franja).json()["id"]

    r = cliente.post(f"/citas/{cita_id}/cancelar", headers=encabezado(paciente), json={"motivo": "No puedo asistir"})
    assert r.status_code == 200
    assert r.json()["estado"] == "cancelada"
    assert r.json()["motivo_cancelacion"] == "No puedo asistir"

    assert _agendar(cliente, fabrica.paciente(), franja).status_code == 201  # HU-21: cupo liberado

    r = cliente.post(f"/citas/{cita_id}/cancelar", headers=encabezado(paciente), json={})
    assert r.status_code == 409  # ya estaba cancelada


def test_reprogramar_reemplaza_la_cita(cliente, fabrica, db):
    paciente = fabrica.paciente()
    original = fabrica.franja(hora=time(8, 0))
    nueva = fabrica.franja(hora=time(10, 0))
    cita_id = _agendar(cliente, paciente, original).json()["id"]

    r = cliente.post(
        f"/citas/{cita_id}/reprogramar",
        headers=encabezado(paciente),
        json={"disponibilidad_id": str(nueva.id)},
    )
    assert r.status_code == 200, r.text
    cita_nueva = r.json()
    assert cita_nueva["id"] != cita_id
    assert cita_nueva["hora"] == "10:00:00"
    assert cita_nueva["numero_comprobante"]  # HU-20: la nueva tiene su propio comprobante

    anterior = cliente.get(f"/citas/{cita_id}", headers=encabezado(paciente)).json()
    assert anterior["estado"] == "reprogramada"
    assert anterior["reprogramada_a"] == cita_nueva["numero_comprobante"]

    db.refresh(original)
    assert original.estado == EstadoDisponibilidad.DISPONIBLE


def test_no_se_puede_ver_ni_cambiar_la_cita_de_otro_paciente(cliente, fabrica):
    cita = fabrica.cita(fabrica.paciente())
    intruso = encabezado(fabrica.paciente())

    assert cliente.get(f"/citas/{cita.id}", headers=intruso).status_code == 404
    assert cliente.post(f"/citas/{cita.id}/cancelar", headers=intruso, json={}).status_code == 404
    assert cliente.get(f"/citas/{cita.id}/comprobante", headers=intruso).status_code == 404
