"""Apartado del personal: permisos por rol y trazabilidad — HU-34 a HU-43, HU-80 a HU-85."""

import pytest

from app.models.personal import RolPersonal
from tests.conftest import encabezado


def test_el_token_del_paciente_no_sirve_en_el_apartado_del_personal(cliente, fabrica):
    paciente = encabezado(fabrica.paciente())
    assert cliente.get("/admin/citas", headers=paciente).status_code == 401
    assert cliente.get("/admin/reportes", headers=paciente).status_code == 401


@pytest.mark.parametrize(
    "rol, ruta, codigo",
    [
        (RolPersonal.AGENDAMIENTO, "/admin/citas", 200),
        (RolPersonal.AGENDAMIENTO, "/admin/auditoria", 403),
        (RolPersonal.AGENDAMIENTO, "/admin/reportes", 403),
        (RolPersonal.CALL_CENTER, "/admin/usuarios", 403),
        (RolPersonal.COORDINADOR_MEDICO, "/admin/reportes", 200),
        (RolPersonal.COORDINADOR_MEDICO, "/admin/auditoria", 403),
        (RolPersonal.ADMINISTRADOR, "/admin/auditoria", 200),
        (RolPersonal.ADMINISTRADOR, "/admin/usuarios", 200),
        # Separación por función (mínimo privilegio)
        (RolPersonal.CALL_CENTER, "/admin/citas", 200),
        (RolPersonal.CALL_CENTER, "/admin/recordatorios", 200),
        (RolPersonal.CALL_CENTER, "/admin/lista-espera", 403),
        (RolPersonal.CALL_CENTER, "/admin/solicitudes", 403),
        (RolPersonal.AGENDAMIENTO, "/admin/recordatorios", 403),
        (RolPersonal.AGENDAMIENTO, "/admin/lista-espera", 200),
        (RolPersonal.AGENDAMIENTO, "/admin/solicitudes", 403),
        (RolPersonal.COORDINADOR_MEDICO, "/admin/lista-espera", 200),  # para la prioridad médica
        (RolPersonal.COORDINADOR_MEDICO, "/admin/solicitudes", 200),
        (RolPersonal.COORDINADOR_MEDICO, "/admin/recordatorios", 403),
        (RolPersonal.COORDINADOR_MEDICO, "/admin/roles", 403),
        (RolPersonal.ADMINISTRADOR, "/admin/roles", 200),
    ],
)
def test_permisos_por_rol(cliente, fabrica, rol, ruta, codigo):
    assert cliente.get(ruta, headers=encabezado(fabrica.personal(rol))).status_code == codigo


def test_cada_rol_solo_hace_lo_de_su_funcion(cliente, fabrica):
    cita = fabrica.cita(fabrica.paciente())
    call_center = encabezado(fabrica.personal(RolPersonal.CALL_CENTER))
    agendamiento = encabezado(fabrica.personal(RolPersonal.AGENDAMIENTO))

    acciones = cliente.get(f"/admin/citas/{cita.id}", headers=call_center).json()["acciones"]
    assert (acciones["recordatorio"], acciones["contactar"], acciones["confirmar"]) == (True, True, True)
    assert (acciones["cancelar"], acciones["reprogramar"]) == (False, False)
    assert cliente.post(f"/admin/citas/{cita.id}/cancelar", headers=call_center, json={}).status_code == 403

    acciones = cliente.get(f"/admin/citas/{cita.id}", headers=agendamiento).json()["acciones"]
    assert (acciones["cancelar"], acciones["reprogramar"], acciones["confirmar"]) == (True, True, True)
    assert (acciones["recordatorio"], acciones["contactar"]) == (False, False)
    assert cliente.post(f"/admin/citas/{cita.id}/recordatorio", headers=agendamiento, json={}).status_code == 403
    contacto = {"resultado": "contesto"}
    assert cliente.post(f"/admin/citas/{cita.id}/contacto", headers=agendamiento, json=contacto).status_code == 403
    assert cliente.post(f"/admin/citas/{cita.id}/contacto", headers=call_center, json=contacto).status_code == 200


def test_cuenta_desactivada_pierde_el_acceso(cliente, fabrica, db):
    persona = fabrica.personal()
    persona.activo = False
    db.commit()
    assert cliente.get("/admin/citas", headers=encabezado(persona)).status_code == 401


def test_el_personal_ve_y_cancela_citas_y_queda_en_la_auditoria(cliente, fabrica):
    agendamiento = fabrica.personal(RolPersonal.AGENDAMIENTO)
    paciente = fabrica.paciente(nombre="Mario Ruiz")
    cita = fabrica.cita(paciente)

    citas = cliente.get("/admin/citas?buscar=Mario Ruiz", headers=encabezado(agendamiento)).json()
    assert [c["id"] for c in citas] == [str(cita.id)]  # HU-34

    r = cliente.post(
        f"/admin/citas/{cita.id}/cancelar",
        headers=encabezado(agendamiento),
        json={"motivo": "El paciente llamó a cancelar"},
    )
    assert r.status_code == 200, r.text  # HU-40

    admin = fabrica.personal(RolPersonal.ADMINISTRADOR)
    registros = cliente.get("/admin/auditoria", headers=encabezado(admin)).json()
    cancelacion = next(r for r in registros if r["cita_id"] == str(cita.id) and r["accion"] == "cancelar")
    assert cancelacion["actor_nombre"].startswith("Personal agendamiento")  # HU-81: quién
    assert cancelacion["estado_nuevo"] == "Cancelada"  # HU-83: estado anterior y nuevo
    assert cancelacion["estado_anterior"] == "Pendiente de confirmar asistencia"
    assert cancelacion["detalle"] == "El paciente llamó a cancelar"
