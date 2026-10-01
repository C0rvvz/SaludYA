"""Lista de espera — HU-19, HU-31, HU-32 (paciente) y HU-45, HU-53 a HU-61 (personal)."""

from datetime import datetime, time, timedelta, timezone

import pytest

from app.models.disponibilidad import Disponibilidad, EstadoDisponibilidad
from app.models.lista_espera import OfertaEspera
from app.models.personal import RolPersonal
from app.services import lista_espera_service
from tests.conftest import encabezado


@pytest.fixture(autouse=True)
def sin_horarios_libres(db):
    """Las migraciones siembran horarios de ejemplo: aquí cada prueba crea solo los que necesita."""
    db.query(Disponibilidad).filter_by(estado=EstadoDisponibilidad.DISPONIBLE).update(
        {"estado": EstadoDisponibilidad.RESERVADO}
    )
    db.commit()


def _unirse(cliente, fabrica, paciente, **cambios):
    datos = {
        "especialidad_id": str(fabrica.especialidad_id),
        "sede_ids": [str(fabrica.sede_id)],
        "jornada": "cualquiera",
        "canal": "whatsapp",
    } | cambios
    return cliente.post("/lista-espera", headers=encabezado(paciente), json=datos)


def test_unirse_sin_horarios_libres_queda_en_espera_con_su_posicion(cliente, fabrica):
    primero, segundo = fabrica.paciente(), fabrica.paciente()
    assert _unirse(cliente, fabrica, primero).status_code == 201
    r = _unirse(cliente, fabrica, segundo)
    assert r.status_code == 201, r.text
    assert r.json()["estado"] == "en_espera"
    assert (r.json()["posicion"], r.json()["total_en_lista"]) == (2, 2)  # HU-19

    mias = cliente.get("/lista-espera", headers=encabezado(primero)).json()
    assert [s["posicion"] for s in mias] == [1]


def test_si_hay_un_horario_compatible_se_ofrece_de_inmediato(cliente, fabrica):
    franja = fabrica.franja()
    r = _unirse(cliente, fabrica, fabrica.paciente())
    assert r.json()["estado"] == "cupo_ofrecido"  # HU-31
    assert r.json()["oferta"]["hora"] == franja.hora.isoformat()


def test_solo_ofrece_horarios_de_su_jornada(cliente, fabrica):
    fabrica.franja(hora=time(15, 0))
    r = _unirse(cliente, fabrica, fabrica.paciente(), jornada="manana")
    assert r.json()["estado"] == "en_espera"


def test_no_se_une_dos_veces_ni_con_datos_invalidos(cliente, fabrica):
    paciente = fabrica.paciente()
    assert _unirse(cliente, fabrica, paciente).status_code == 201
    assert _unirse(cliente, fabrica, paciente).status_code == 400
    otro = fabrica.paciente()
    assert _unirse(cliente, fabrica, otro, especialidad_id=str(otro.id)).status_code == 400
    assert _unirse(cliente, fabrica, otro, sede_ids=[str(otro.id)]).status_code == 400


def test_aceptar_el_cupo_registra_la_cita(cliente, fabrica):
    paciente = fabrica.paciente()
    fabrica.franja()
    solicitud = _unirse(cliente, fabrica, paciente).json()

    r = cliente.post(f"/lista-espera/{solicitud['id']}/aceptar", headers=encabezado(paciente))
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "asignada"  # HU-32, criterio 2
    assert r.json()["cita"]["numero_comprobante"]
    citas = cliente.get("/citas?vista=proximas", headers=encabezado(paciente)).json()
    assert [c["id"] for c in citas] == [r.json()["cita"]["id"]]


def test_rechazar_conserva_el_lugar_y_ofrece_otro_horario(cliente, fabrica, db):
    paciente = fabrica.paciente()
    primera = fabrica.franja(hora=time(8, 0))
    fabrica.franja(hora=time(9, 0))
    solicitud = _unirse(cliente, fabrica, paciente).json()
    assert solicitud["oferta"]["hora"] == "08:00:00"

    r = cliente.post(f"/lista-espera/{solicitud['id']}/rechazar", headers=encabezado(paciente))
    assert r.status_code == 200
    assert r.json()["posicion"] == 1  # HU-32, criterio 3
    assert r.json()["oferta"]["hora"] == "09:00:00"  # el siguiente compatible
    db.refresh(primera)
    assert primera.estado == EstadoDisponibilidad.DISPONIBLE

    cliente.post(f"/lista-espera/{solicitud['id']}/rechazar", headers=encabezado(paciente))
    sin_oferta = cliente.post(f"/lista-espera/{solicitud['id']}/aceptar", headers=encabezado(paciente))
    assert sin_oferta.status_code == 400  # ya no le queda ningún cupo ofrecido


def test_la_oferta_vence_si_no_responde(cliente, fabrica, db):
    paciente = fabrica.paciente()
    franja = fabrica.franja()
    solicitud = _unirse(cliente, fabrica, paciente).json()
    oferta = db.query(OfertaEspera).filter_by(disponibilidad_id=franja.id).one()
    oferta.expira_en = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    r = cliente.post(f"/lista-espera/{solicitud['id']}/aceptar", headers=encabezado(paciente))
    assert r.status_code == 400
    assert "venció" in r.json()["detail"]

    assert lista_espera_service.vencer_ofertas(db) == 1
    db.refresh(franja)
    assert franja.estado == EstadoDisponibilidad.DISPONIBLE
    assert cliente.get("/lista-espera", headers=encabezado(paciente)).json()[0]["estado"] == "en_espera"


def test_una_cancelacion_le_ofrece_el_cupo_al_primero_de_la_lista(cliente, fabrica):
    quien_cancela, quien_espera = fabrica.paciente(), fabrica.paciente()
    cita = fabrica.cita(quien_cancela)
    assert _unirse(cliente, fabrica, quien_espera).json()["estado"] == "en_espera"

    cliente.post(f"/citas/{cita.id}/cancelar", headers=encabezado(quien_cancela), json={})

    solicitud = cliente.get("/lista-espera", headers=encabezado(quien_espera)).json()[0]
    assert solicitud["estado"] == "cupo_ofrecido"


def test_salir_de_la_lista(cliente, fabrica):
    paciente = fabrica.paciente()
    solicitud = _unirse(cliente, fabrica, paciente).json()
    r = cliente.post(f"/lista-espera/{solicitud['id']}/salir", headers=encabezado(paciente))
    assert r.json()["estado"] == "cancelada"
    assert cliente.post(f"/lista-espera/{solicitud['id']}/salir", headers=encabezado(paciente)).status_code == 400
    ajeno = cliente.post(f"/lista-espera/{solicitud['id']}/salir", headers=encabezado(fabrica.paciente()))
    assert ajeno.status_code == 400


# --- Personal ---

def test_el_personal_ve_la_lista_y_la_prioridad_cambia_el_orden(cliente, fabrica):
    coordinador = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    primero, segundo = fabrica.paciente(), fabrica.paciente()
    _unirse(cliente, fabrica, primero)
    solicitud = _unirse(cliente, fabrica, segundo).json()

    r = cliente.patch(
        f"/admin/lista-espera/{solicitud['id']}/prioridad",
        headers=encabezado(coordinador),
        json={"prioridad": "urgente"},
    )
    assert r.status_code == 200, r.text
    assert (r.json()["prioridad"], r.json()["posicion"]) == ("urgente", 1)  # HU-56

    lista = cliente.get("/admin/lista-espera", headers=encabezado(coordinador)).json()
    assert lista["esperando_ahora"] == 2  # HU-45
    assert [s["paciente_id"] for s in lista["solicitudes"]] == [str(segundo.id), str(primero.id)]
    assert all(s["minutos_espera"] >= 0 for s in lista["solicitudes"])

    agendamiento = fabrica.personal(RolPersonal.AGENDAMIENTO)
    r = cliente.patch(
        f"/admin/lista-espera/{solicitud['id']}/prioridad", headers=encabezado(agendamiento), json={"prioridad": "alta"}
    )
    assert r.status_code == 403  # la prioridad médica no la define agendamiento


def test_el_personal_confirma_una_cita_desde_la_lista(cliente, fabrica):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    solicitud = _unirse(cliente, fabrica, paciente, jornada="tarde").json()
    franja = fabrica.franja(hora=time(14, 0))

    horarios = cliente.get(f"/admin/lista-espera/{solicitud['id']}/horarios", headers=encabezado(admin)).json()
    assert str(franja.id) in [h["id"] for h in horarios]  # HU-55

    otro = fabrica.otro_especialista
    otra = fabrica.franja(especialista_id=otro.id, sede_id=otro.sedes[0].id)
    r = cliente.post(
        f"/admin/lista-espera/{solicitud['id']}/confirmar", headers=encabezado(admin),
        json={"disponibilidad_id": str(otra.id)},
    )
    assert r.status_code == 400  # horario de otra especialidad

    r = cliente.post(
        f"/admin/lista-espera/{solicitud['id']}/confirmar", headers=encabezado(admin),
        json={"disponibilidad_id": str(franja.id)},
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "asignada"  # HU-59
    assert cliente.get(f"/admin/lista-espera/{solicitud['id']}/horarios", headers=encabezado(admin)).json() == []


def test_el_personal_cancela_desde_la_lista(cliente, fabrica):
    admin = fabrica.personal()
    en_espera = _unirse(cliente, fabrica, fabrica.paciente()).json()
    r = cliente.post(
        f"/admin/lista-espera/{en_espera['id']}/cancelar", headers=encabezado(admin), json={"motivo": "Ya no la necesita"}
    )
    assert r.json()["estado"] == "cancelada"  # HU-60: sale de la lista

    paciente = fabrica.paciente()
    fabrica.franja()
    asignada = _unirse(cliente, fabrica, paciente).json()
    cliente.post(f"/lista-espera/{asignada['id']}/aceptar", headers=encabezado(paciente))
    r = cliente.post(f"/admin/lista-espera/{asignada['id']}/cancelar", headers=encabezado(admin), json={})
    assert r.status_code == 200
    assert r.json()["cita"]["estado"] == "Cancelada"  # HU-60: se cancela la cita asignada

    otra_vez = cliente.post(f"/admin/lista-espera/{asignada['id']}/cancelar", headers=encabezado(admin), json={})
    assert otra_vez.status_code == 400
    inexistente = cliente.post(f"/admin/lista-espera/{admin.id}/cancelar", headers=encabezado(admin), json={})
    assert inexistente.status_code == 400
