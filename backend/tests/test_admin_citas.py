"""Gestión de citas del personal — HU-34 a HU-43."""

from datetime import time

from app.integrations import notificaciones
from app.models.cita import EstadoCita
from app.models.personal import RolPersonal
from app.services import recordatorios_service
from tests.conftest import encabezado


def test_detalle_con_historial_riesgo_y_acciones_segun_el_rol(cliente, fabrica):
    paciente = fabrica.paciente()
    for _ in range(2):
        fabrica.cita(paciente, EstadoCita.NO_ASISTIO)
    cita = fabrica.cita(paciente)

    agendamiento = fabrica.personal(RolPersonal.AGENDAMIENTO)
    r = cliente.get(f"/admin/citas/{cita.id}", headers=encabezado(agendamiento))
    assert r.status_code == 200, r.text
    detalle = r.json()
    assert len(detalle["historial_asistencia"]) == 2  # HU-35, criterio 1
    assert detalle["resumen_asistencia"]["no_asistio"] == 2  # HU-35, criterio 3
    assert detalle["riesgo"] is not None  # HU-46: riesgo por sus inasistencias
    acciones = detalle["acciones"]  # HU-43, criterio 2
    assert acciones["cancelar"]
    assert acciones["confirmar"]
    assert not acciones["registrar_resultado"]

    coordinador = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    acciones = cliente.get(f"/admin/citas/{cita.id}", headers=encabezado(coordinador)).json()["acciones"]
    assert not acciones["cancelar"]
    assert acciones["observar"]

    assert cliente.get(f"/admin/citas/{paciente.id}", headers=encabezado(agendamiento)).status_code == 404


def test_filtros_de_la_lista_de_citas(cliente, fabrica):
    admin = fabrica.personal()
    paciente = fabrica.paciente(nombre="Filtro Único")
    cita = fabrica.cita(paciente)
    fabrica.cita(paciente, EstadoCita.CANCELADA)

    def ids(consulta):
        return [c["id"] for c in cliente.get(f"/admin/citas?{consulta}", headers=encabezado(admin)).json()]

    assert len(ids("buscar=Filtro Único")) == 2
    assert ids("buscar=Filtro Único&estado=pendiente_confirmar") == [str(cita.id)]
    assert ids(f"buscar={cita.numero_comprobante}") == [str(cita.id)]
    assert ids(f"especialidad_id={fabrica.otro_especialista.especialidad_id}&buscar=Filtro") == []


def test_confirmar_y_reprogramar_por_el_personal(cliente, fabrica):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, hora=time(7, 0))
    nueva = fabrica.franja(hora=time(11, 0))

    r = cliente.post(f"/admin/citas/{cita.id}/confirmar", headers=encabezado(admin))
    assert r.json()["estado_visible"] == "asistencia_confirmada"  # HU-38

    r = cliente.post(f"/admin/citas/{cita.id}/reprogramar", headers=encabezado(admin), json={"disponibilidad_id": str(nueva.id)})
    assert r.status_code == 200, r.text
    assert r.json()["hora"] == "11:00:00"  # HU-39: devuelve la cita nueva
    assert r.json()["id"] != str(cita.id)


def test_errores_al_reprogramar(cliente, fabrica):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente)
    ruta = f"/citas/{cita.id}/reprogramar"

    def reprogramar(franja_id):
        return cliente.post(ruta, headers=encabezado(paciente), json={"disponibilidad_id": str(franja_id)})

    assert reprogramar(cita.disponibilidad_id).status_code == 400  # el mismo horario
    assert reprogramar(paciente.id).status_code == 404  # no existe
    otro = fabrica.otro_especialista
    assert reprogramar(fabrica.franja(especialista_id=otro.id, sede_id=otro.sedes[0].id).id).status_code == 400
    ocupada = fabrica.cita(fabrica.paciente())
    assert reprogramar(ocupada.disponibilidad_id).status_code == 409


def test_recordatorio_manual_contacto_y_observaciones(cliente, fabrica, monkeypatch):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente)

    r = cliente.post(f"/admin/citas/{cita.id}/recordatorio", headers=encabezado(admin))
    assert r.status_code == 200, r.text
    assert len(r.json()["recordatorios"]) == 1  # HU-36, criterio 4: queda registrado

    r = cliente.post(
        f"/admin/citas/{cita.id}/contacto", headers=encabezado(admin), json={"resultado": "no_contesto", "nota": "Sin señal"}
    )
    assert r.json()["contactos"][0]["descripcion"] == "Llamó al paciente: No contestó"  # HU-37

    r = cliente.post(
        f"/admin/pacientes/{paciente.id}/observaciones", headers=encabezado(admin),
        json={"texto": "Prefiere que lo llamen en la tarde.", "cita_id": str(cita.id)},
    )
    assert r.status_code == 201  # HU-41
    assert r.json()["numero_comprobante"] == cita.numero_comprobante
    detalle = cliente.get(f"/admin/citas/{cita.id}", headers=encabezado(admin)).json()
    assert [o["texto"] for o in detalle["observaciones"]] == ["Prefiere que lo llamen en la tarde."]

    ajena = fabrica.cita(fabrica.paciente())
    r = cliente.post(
        f"/admin/pacientes/{paciente.id}/observaciones", headers=encabezado(admin),
        json={"texto": "Nota", "cita_id": str(ajena.id)},
    )
    assert r.status_code == 404
    r = cliente.post(f"/admin/pacientes/{cita.id}/observaciones", headers=encabezado(admin), json={"texto": "Nota"})
    assert r.status_code == 404

    monkeypatch.setattr(recordatorios_service, "enviar_por_canal", lambda *a: False)
    r = cliente.post(f"/admin/citas/{cita.id}/recordatorio", headers=encabezado(admin))
    assert r.status_code == 502  # el envío falló: se informa
    pasada = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    assert cliente.post(f"/admin/citas/{pasada.id}/recordatorio", headers=encabezado(admin)).status_code == 409


def test_canal_no_whatsapp_se_simula(fabrica):
    paciente = fabrica.paciente()
    assert notificaciones.enviar_por_canal(paciente, notificaciones.CanalContacto.SMS, "Hola") is True
