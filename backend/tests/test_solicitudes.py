"""Solicitudes de cita (cartas de petición) y revisión clínica — HU-46, HU-47, HU-76 a HU-79."""

from datetime import timedelta

from app.models.cita import EstadoCita
from app.models.personal import RolPersonal
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado


def _radicar(cliente, fabrica, paciente, **cambios):
    datos = {
        "tipo": "derecho_peticion",
        "especialidad_id": str(fabrica.especialidad_id),
        "tipo_cita": "primera_vez",
        "fecha_deseada": (hoy_en_colombia() + timedelta(days=7)).isoformat(),
        "motivo": "Necesito una valoración por dolor persistente.",
        "canal": "whatsapp",
    } | cambios
    return cliente.post("/solicitudes", headers=encabezado(paciente), json=datos)


def test_el_paciente_radica_y_consulta_su_solicitud(cliente, fabrica):
    paciente = fabrica.paciente()
    r = _radicar(cliente, fabrica, paciente)
    assert r.status_code == 201, r.text
    assert r.json()["numero_radicado"].startswith("RAD-")
    assert r.json()["estado"] == "pendiente"

    mias = cliente.get("/solicitudes", headers=encabezado(paciente)).json()
    assert [s["id"] for s in mias] == [r.json()["id"]]
    assert cliente.get("/solicitudes", headers=encabezado(fabrica.paciente())).json() == []


def test_validaciones_al_radicar(cliente, fabrica):
    paciente = fabrica.paciente()
    assert _radicar(cliente, fabrica, paciente, fecha_deseada=hoy_en_colombia().isoformat()).status_code == 400
    assert _radicar(cliente, fabrica, paciente, especialidad_id=str(paciente.id)).status_code == 400
    assert _radicar(cliente, fabrica, paciente, motivo="corto").status_code == 422


def test_aprobar_asigna_la_cita(cliente, fabrica):
    coordinador = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    paciente = fabrica.paciente()
    fabrica.cita(paciente, EstadoCita.NO_ASISTIO)  # historial para la revisión clínica
    solicitud = _radicar(cliente, fabrica, paciente).json()
    franja = fabrica.franja()

    lista = cliente.get("/admin/solicitudes", headers=encabezado(coordinador)).json()
    assert [s["id"] for s in lista] == [solicitud["id"]]  # HU-76

    revision = cliente.get(f"/admin/solicitudes/{solicitud['id']}", headers=encabezado(coordinador)).json()
    assert revision["paciente"]["nombre"] == paciente.nombre  # HU-78: contexto del paciente
    assert len(revision["historial"]) == 1

    r = cliente.post(
        f"/admin/solicitudes/{solicitud['id']}/aprobar",
        headers=encabezado(coordinador),
        json={"disponibilidad_id": str(franja.id), "prioritaria": True, "respuesta": "Aprobada"},
    )
    assert r.status_code == 200, r.text
    aprobada = r.json()["solicitud"]
    assert aprobada["estado"] == "aprobada"
    assert aprobada["prioritaria"] is True
    assert aprobada["cita"]["numero_comprobante"]  # HU-47: cita asignada
    assert aprobada["revisor"] == coordinador.nombre

    otra_vez = cliente.post(
        f"/admin/solicitudes/{solicitud['id']}/negar", headers=encabezado(coordinador),
        json={"respuesta": "Ya no aplica"},
    )
    assert otra_vez.status_code == 400  # ya fue decidida


def test_no_aprueba_con_un_horario_de_otra_especialidad(cliente, fabrica):
    coordinador = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    solicitud = _radicar(cliente, fabrica, fabrica.paciente()).json()
    otro = fabrica.otro_especialista
    otra = fabrica.franja(especialista_id=otro.id, sede_id=otro.sedes[0].id)
    r = cliente.post(
        f"/admin/solicitudes/{solicitud['id']}/aprobar", headers=encabezado(coordinador),
        json={"disponibilidad_id": str(otra.id)},
    )
    assert r.status_code == 400


def test_enviar_a_la_eps_y_luego_negar(cliente, fabrica):
    coordinador = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    solicitud = _radicar(cliente, fabrica, fabrica.paciente()).json()
    ruta = f"/admin/solicitudes/{solicitud['id']}"

    r = cliente.post(f"{ruta}/enviar-eps", headers=encabezado(coordinador), json={})
    assert r.json()["solicitud"]["estado"] == "pendiente_eps"  # HU-47, criterio 3
    assert cliente.post(f"{ruta}/enviar-eps", headers=encabezado(coordinador), json={}).status_code == 400

    assert cliente.post(f"{ruta}/negar", headers=encabezado(coordinador), json={"respuesta": "no"}).status_code == 422
    r = cliente.post(f"{ruta}/negar", headers=encabezado(coordinador), json={"respuesta": "La EPS no lo autorizó."})
    negada = r.json()["solicitud"]
    assert negada["estado"] == "negada"
    assert negada["respuesta_eps_en"] is not None


def test_solo_quien_revisa_decide_y_los_indicadores_cuentan(cliente, fabrica):
    solicitud = _radicar(cliente, fabrica, fabrica.paciente()).json()
    agendamiento = fabrica.personal(RolPersonal.AGENDAMIENTO)
    r = cliente.post(
        f"/admin/solicitudes/{solicitud['id']}/negar", headers=encabezado(agendamiento),
        json={"respuesta": "No corresponde"},
    )
    assert r.status_code == 403  # HU-79: la revisión clínica es del coordinador médico
    assert cliente.get(f"/admin/solicitudes/{agendamiento.id}", headers=encabezado(agendamiento)).status_code == 404

    admin = fabrica.personal()
    indicadores = cliente.get("/admin/reportes?periodo=anio", headers=encabezado(admin)).json()["solicitudes"]
    assert indicadores["recibidas"] == 1  # HU-46
    assert indicadores["pendientes_revision"] == 1
