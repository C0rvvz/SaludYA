"""Recordatorios automáticos (HU-22) y Centro de recordatorios del personal (HU-62 a HU-67)."""

from datetime import datetime, timedelta, timezone

from app.models.cita import EstadoCita
from app.models.recordatorio_programado import EstadoProgramacion, RecordatorioProgramado
from app.services import centro_recordatorios_service, recordatorios_service
from app.utils.tiempo import ahora_colombia
from tests.conftest import encabezado


def _cita_en(fabrica, paciente, horas: int):
    inicio = (ahora_colombia() + timedelta(hours=horas)).replace(second=0, microsecond=0)
    return fabrica.cita(paciente, fecha=inicio.date(), hora=inicio.time())


# --- HU-22: recordatorio automático ---

def test_envia_el_recordatorio_solo_a_las_citas_dentro_de_la_ventana(db, fabrica):
    paciente = fabrica.paciente()
    manana = _cita_en(fabrica, paciente, 20)
    lejana = _cita_en(fabrica, paciente, 72)

    assert recordatorios_service.enviar_recordatorios_pendientes(db) == 1
    db.refresh(manana)
    db.refresh(lejana)
    assert manana.recordatorio_enviado_en is not None
    assert lejana.recordatorio_enviado_en is None
    assert recordatorios_service.enviar_recordatorios_pendientes(db) == 0  # no se repite


def test_si_el_envio_falla_se_reintenta_en_la_siguiente_pasada(db, fabrica, monkeypatch):
    cita = _cita_en(fabrica, fabrica.paciente(), 5)
    monkeypatch.setattr(recordatorios_service, "enviar_por_canal", lambda *a: False)
    assert recordatorios_service.enviar_recordatorios_pendientes(db) == 0
    db.refresh(cita)
    assert (cita.recordatorio_intentos, cita.recordatorio_enviado_en) == (1, None)


def test_el_mensaje_trae_fecha_hora_y_enlace_para_confirmar(fabrica):
    cita = fabrica.cita(fabrica.paciente())
    mensaje = recordatorios_service.mensaje_recordatorio(cita)
    assert cita.numero_comprobante in mensaje
    assert "/confirmar-asistencia?token=" in mensaje  # HU-23, criterio 1


# --- Centro de recordatorios ---

def _programar(cliente, personal, paciente, **cambios):
    datos = {
        "paciente_id": str(paciente.id),
        "canal": "whatsapp",
        "texto": "Recuerde su cita.",
        "programado_para": (ahora_colombia() + timedelta(hours=2)).replace(microsecond=0).isoformat(),
    } | cambios
    return cliente.post("/admin/recordatorios/programados", headers=encabezado(personal), json=datos)


def test_lista_de_pacientes_con_su_ultimo_envio(cliente, fabrica):
    admin = fabrica.personal()
    paciente = fabrica.paciente(nombre="Paciente Recordado")
    cita = fabrica.cita(paciente)
    cliente.post(f"/admin/citas/{cita.id}/recordatorio", headers=encabezado(admin))

    filas = cliente.get("/admin/recordatorios", headers=encabezado(admin)).json()
    fila = next(f for f in filas if f["paciente_id"] == str(paciente.id))
    assert fila["canal_preferido"] == "whatsapp"  # HU-63
    assert fila["estado"] == "enviado"
    assert [c["id"] for c in fila["citas_activas"]] == [str(cita.id)]

    cliente.post(f"/citas/{cita.id}/confirmar-asistencia", headers=encabezado(paciente))
    fila = next(f for f in cliente.get("/admin/recordatorios", headers=encabezado(admin)).json()
                if f["paciente_id"] == str(paciente.id))
    assert fila["estado"] == "respondido"  # confirmó después del envío

    cliente.post(f"/admin/citas/{cita.id}/contacto", headers=encabezado(admin), json={"resultado": "buzon_de_voz"})
    fila = next(f for f in cliente.get("/admin/recordatorios", headers=encabezado(admin)).json()
                if f["paciente_id"] == str(paciente.id))
    assert fila["ultimo_envio"] == "Llamó al paciente: Buzón de voz"


def test_plantillas(cliente, fabrica):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente)

    sin_cita = cliente.get(f"/admin/recordatorios/plantillas?paciente_id={paciente.id}", headers=encabezado(admin)).json()
    textos = {p["clave"]: p["texto"] for p in sin_cita}
    assert textos["recordatorio_estandar"] is None  # necesita una cita (HU-66)
    assert "se liberaron cupos" in textos["cupo_liberado"]

    con_cita = cliente.get(
        f"/admin/recordatorios/plantillas?paciente_id={paciente.id}&cita_id={cita.id}", headers=encabezado(admin)
    ).json()
    textos = {p["clave"]: p["texto"] for p in con_cita}
    assert "URGENTE" in textos["confirmacion_urgente"]
    assert "antes de su cita" in textos["cupo_liberado"]
    assert cita.numero_comprobante in textos["recordatorio_estandar"]

    ajeno = cliente.get(f"/admin/recordatorios/plantillas?paciente_id={cita.id}", headers=encabezado(admin))
    assert ajeno.status_code == 400


def test_programar_editar_cancelar_un_recordatorio(cliente, fabrica):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente)

    r = _programar(cliente, admin, paciente, canal="llamada", cita_id=str(cita.id), plantilla="confirmacion_urgente")
    assert r.status_code == 201, r.text  # HU-65: llamada programada
    programado = r.json()
    assert programado["estado"] == "pendiente"

    nueva_hora = (ahora_colombia() + timedelta(hours=3)).replace(microsecond=0).isoformat()
    r = cliente.put(
        f"/admin/recordatorios/programados/{programado['id']}", headers=encabezado(admin),
        json={"canal": "sms", "texto": "Texto editado", "programado_para": nueva_hora},
    )
    assert (r.json()["canal"], r.json()["texto"]) == ("sms", "Texto editado")

    lista = cliente.get("/admin/recordatorios/programados", headers=encabezado(admin)).json()
    assert programado["id"] in [p["id"] for p in lista]

    r = cliente.post(f"/admin/recordatorios/programados/{programado['id']}/cancelar", headers=encabezado(admin))
    assert r.json()["estado"] == "cancelado"
    otra_vez = cliente.post(f"/admin/recordatorios/programados/{programado['id']}/cancelar", headers=encabezado(admin))
    assert otra_vez.status_code == 400
    inexistente = cliente.post(f"/admin/recordatorios/programados/{cita.id}/cancelar", headers=encabezado(admin))
    assert inexistente.status_code == 400


def test_validaciones_al_programar(cliente, fabrica):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente)
    pasado = (ahora_colombia() - timedelta(hours=1)).isoformat()
    despues_de_la_cita = (datetime.combine(cita.disponibilidad.fecha, cita.disponibilidad.hora) + timedelta(hours=1)).isoformat()

    assert _programar(cliente, admin, paciente, programado_para=pasado).status_code == 400
    assert _programar(cliente, admin, paciente, cita_id=str(cita.id), programado_para=despues_de_la_cita).status_code == 400
    assert _programar(cliente, admin, paciente, cita_id=str(fabrica.cita(fabrica.paciente()).id)).status_code == 400
    cancelada = fabrica.cita(paciente, EstadoCita.CANCELADA)
    assert _programar(cliente, admin, paciente, cita_id=str(cancelada.id)).status_code == 400
    assert _programar(cliente, admin, cita).status_code == 400  # no es un paciente


def test_la_tarea_envia_los_programados_y_los_reintenta(cliente, db, fabrica, monkeypatch):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    programado_id = _programar(cliente, admin, paciente).json()["id"]
    programado = db.get(RecordatorioProgramado, programado_id)
    programado.programado_para = datetime.now(timezone.utc) - timedelta(minutes=1)  # ya llegó su hora
    db.commit()

    monkeypatch.setattr(centro_recordatorios_service, "enviar_por_canal", lambda *a: False)
    for _ in range(3):  # RECORDATORIO_MAX_INTENTOS
        assert centro_recordatorios_service.enviar_programados_vencidos(db) == 0
    db.refresh(programado)
    assert (programado.estado, programado.intentos) == (EstadoProgramacion.FALLIDO, 3)

    monkeypatch.setattr(centro_recordatorios_service, "enviar_por_canal", lambda *a: True)
    r = cliente.post(f"/admin/recordatorios/programados/{programado_id}/reintentar", headers=encabezado(admin))
    assert r.json()["estado"] == "enviado"
    assert r.json()["enviado_en"] is not None
