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
    ],
)
def test_permisos_por_rol(cliente, fabrica, rol, ruta, codigo):
    assert cliente.get(ruta, headers=encabezado(fabrica.personal(rol))).status_code == codigo


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
