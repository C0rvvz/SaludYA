"""Especialistas en el panel del personal e IPS simulada (RNF: base de datos de especialistas actualizada)."""

import random
import uuid
from datetime import datetime, time, timedelta, timezone

import pytest

from app.models.disponibilidad import Disponibilidad
from app.models.eps import Eps
from app.models.especialidad import Especialidad
from app.models.especialista import Especialista
from app.models.personal import RolPersonal
from app.models.sede import Sede
from app.models.sincronizacion_ips import SincronizacionIps
from app.services import disponibilidad_service, ips_simulada_service
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado


@pytest.fixture
def catalogo(db):
    sedes = {s.nombre: str(s.id) for s in db.query(Sede).all()}
    especialidades = {e.nombre: str(e.id) for e in db.query(Especialidad).all()}
    eps = {e.nombre: str(e.id) for e in db.query(Eps).all()}
    return sedes, especialidades, eps


def _turno(dia, sede, desde, hasta, duracion=30, modalidad="presencial"):
    return {"dia_semana": dia, "sede_id": sede, "modalidad": modalidad,
            "hora_inicio": desde, "hora_fin": hasta, "duracion_minutos": duracion}


def _nuevo(catalogo, **cambios):
    sedes, especialidades, eps = catalogo
    return {
        "tratamiento": "Dra.", "nombre": "Prueba Uno", "especialidad_id": especialidades["Dermatología"],
        "eps_id": eps["Sanitas"], "registro_medico": "05-555001",
        "turnos": [
            _turno(0, sedes["Sede Poblado"], "07:00", "09:00"),
            _turno(2, sedes["Sede Laureles"], "14:00", "16:00", 20, "virtual"),
        ],
    } | cambios


def test_solo_el_administrador_gestiona_especialistas(cliente, fabrica):
    for rol in (RolPersonal.COORDINADOR_MEDICO, RolPersonal.AGENDAMIENTO, RolPersonal.CALL_CENTER):
        assert cliente.get("/admin/especialistas", headers=encabezado(fabrica.personal(rol))).status_code == 403


def test_agregar_un_especialista_con_su_horario(cliente, fabrica, catalogo):
    admin = fabrica.personal()
    r = cliente.post("/admin/especialistas", headers=encabezado(admin), json=_nuevo(catalogo))
    assert r.status_code == 201, r.text
    nueva = r.json()
    assert (nueva["nombre"], nueva["origen"], nueva["activo"]) == ("Dra. Prueba Uno", "manual", True)
    assert nueva["sedes"] == ["Sede Laureles", "Sede Poblado"]
    assert nueva["cupos_libres"] > 0  # su agenda de los próximos 10 días hábiles ya está

    # Los pacientes ya la ven, con sus sedes y modalidades sacadas del horario.
    dermatologia = catalogo[1]["Dermatología"]
    publicos = cliente.get(f"/especialistas?especialidad_id={dermatologia}").json()
    suya = next(e for e in publicos if e["nombre"] == "Dra. Prueba Uno")
    assert sorted(suya["modalidades"]) == ["presencial", "virtual"]

    registro = next(
        r for r in cliente.get("/admin/auditoria", headers=encabezado(admin)).json() if r["accion"] == "crear_especialista"
    )
    assert registro["descripcion"] == "Agregó a Dra. Prueba Uno (Dermatología, Sanitas) con 2 turnos a la semana"


def test_validaciones_del_horario(cliente, fabrica, catalogo):
    sedes, _, _ = catalogo
    admin = encabezado(fabrica.personal())
    cruzados = [_turno(0, sedes["Sede Poblado"], "07:00", "12:00"), _turno(0, sedes["Sede Laureles"], "11:00", "13:00")]
    r = cliente.post("/admin/especialistas", headers=admin, json=_nuevo(catalogo, turnos=cruzados))
    assert r.status_code == 400
    assert "no puede estar en dos lugares a la vez" in r.json()["detail"]

    casos = [
        [_turno(1, sedes["Sede Poblado"], "07:00", "09:00", 25)],  # duración que no se usa
        [_turno(1, sedes["Sede Poblado"], "07:00", "07:15", 30)],  # no cabe ni una cita
        [_turno(1, sedes["Sede Poblado"], "05:00", "07:00")],  # muy temprano
        [_turno(1, str(uuid.uuid4()), "07:00", "09:00")],  # sede que no existe
    ]
    for turnos in casos:
        assert cliente.post("/admin/especialistas", headers=admin, json=_nuevo(catalogo, turnos=turnos)).status_code in (400, 422)
    assert cliente.post("/admin/especialistas", headers=admin, json=_nuevo(catalogo)).status_code == 201
    repetido = cliente.post("/admin/especialistas", headers=admin, json=_nuevo(catalogo, registro_medico=None))
    assert repetido.status_code == 400 and "Ya existe" in repetido.json()["detail"]


def test_cambiar_el_horario_conserva_las_citas(cliente, fabrica, catalogo, db):
    sedes, _, _ = catalogo
    admin = encabezado(fabrica.personal())
    nueva = cliente.post("/admin/especialistas", headers=admin, json=_nuevo(catalogo)).json()
    desde, hasta = disponibilidad_service.ventana()
    lunes = next(desde + timedelta(days=i) for i in range(7) if (desde + timedelta(days=i)).weekday() == 0)
    cita = fabrica.cita(fabrica.paciente(), especialista_id=nueva["id"], sede_id=sedes["Sede Poblado"], fecha=lunes, hora=time(19, 0))

    solo_martes = [_turno(1, sedes["Sede Poblado"], "08:00", "10:00")]
    r = cliente.put(f"/admin/especialistas/{nueva['id']}/horario", headers=admin, json={"turnos": solo_martes})
    assert r.status_code == 200, r.text
    franjas = db.query(Disponibilidad).filter(Disponibilidad.especialista_id == nueva["id"], Disponibilidad.fecha > hoy_en_colombia()).all()
    assert {f.fecha.weekday() for f in franjas if f.id != cita.disponibilidad_id} == {1}  # solo martes
    assert cita.disponibilidad_id in {f.id for f in franjas}  # la cita ya agendada se conserva
    assert r.json()["sedes"] == ["Sede Poblado"]


def test_desactivar_y_activar(cliente, fabrica, catalogo):
    admin = encabezado(fabrica.personal())
    nueva = cliente.post("/admin/especialistas", headers=admin, json=_nuevo(catalogo)).json()
    ruta = f"/admin/especialistas/{nueva['id']}/estado"

    r = cliente.patch(ruta, headers=admin, json={"activo": False})
    assert (r.json()["activo"], r.json()["cupos_libres"]) == (False, 0)
    publicos = cliente.get("/especialistas").json()
    assert "Dra. Prueba Uno" not in [e["nombre"] for e in publicos]  # ya no se ofrece a los pacientes

    r = cliente.patch(ruta, headers=admin, json={"activo": True})
    assert r.json()["activo"] is True and r.json()["cupos_libres"] > 0


def test_actualizacion_de_la_ips(cliente, fabrica, db):
    admin = fabrica.personal()
    antes = db.query(Especialista).count()
    sincronizacion = ips_simulada_service.sincronizar(db, admin, random.Random(7))
    nuevos = db.query(Especialista).filter(Especialista.origen == "ips").all()
    assert 1 <= sincronizacion.especialistas_nuevos == len(nuevos) == db.query(Especialista).count() - antes
    assert sincronizacion.solicitada_por == f"{admin.nombre} (Administrador)"
    assert sincronizacion.origen == "manual"
    assert sincronizacion.franjas_creadas > 0  # incluye la agenda de los que llegaron
    assert sincronizacion.detalle.startswith("Llegaron: ") and sincronizacion.detalle.endswith(").")
    for e in nuevos:
        assert e.registro_medico.startswith("05-") and e.nombre.split()[0] in ("Dr.", "Dra.")
        assert e.turnos and len({t.dia_semana for t in e.turnos}) == len(e.turnos)  # uno por día: no se cruzan

    # Desde el panel: se pide y queda en el historial.
    r = cliente.post("/admin/especialistas/sincronizar-ips", headers=encabezado(admin))
    assert r.status_code == 200, r.text
    panel = cliente.get("/admin/especialistas", headers=encabezado(admin)).json()
    assert panel["sincronizaciones"][0]["id"] == r.json()["id"]
    assert panel["dias_entre_actualizaciones"] == 10


def test_la_ips_solo_retira_a_los_que_llegaron_por_ella(db, fabrica, monkeypatch):
    ips_simulada_service.sincronizar(db, None, random.Random(1))  # llega al menos uno
    monkeypatch.setattr(ips_simulada_service, "MAX_ACTIVOS", 1)  # la red está "llena": sale uno y no llega nadie
    sincronizacion = ips_simulada_service.sincronizar(db, None, random.Random(2))
    assert (sincronizacion.especialistas_retirados, sincronizacion.especialistas_nuevos) == (1, 0)
    assert "Dejó de atender en la red" in sincronizacion.detalle
    retirados = db.query(Especialista).filter(Especialista.activo.is_(False)).all()
    assert [e.origen for e in retirados] == ["ips"]
    assert db.query(Especialista).filter(Especialista.origen == "semilla", Especialista.activo.is_(False)).count() == 0


def test_la_actualizacion_automatica_es_cada_10_dias(db):
    assert ips_simulada_service.sincronizar_si_corresponde(db) is None  # la carga inicial es de hoy
    inicial = ips_simulada_service.ultima(db)
    assert inicial.origen == "inicial"
    inicial.fecha = datetime.now(timezone.utc) - timedelta(days=11)
    db.commit()
    automatica = ips_simulada_service.sincronizar_si_corresponde(db)
    assert automatica is not None and automatica.origen == "automatica" and automatica.solicitada_por is None
    assert db.query(SincronizacionIps).count() == 2


# --- Sedes (RF-89) ---

def test_crear_editar_y_cerrar_una_sede(cliente, fabrica, catalogo, db):
    admin = encabezado(fabrica.personal())
    r = cliente.post("/admin/sedes", headers=admin, json={"nombre": "Sede Bello", "ciudad": "Bello", "direccion": "Cl. 50 # 49-20"})
    assert r.status_code == 201, r.text
    bello = r.json()
    assert (bello["activa"], bello["especialistas"], bello["citas_proximas"]) == (True, [], 0)
    assert cliente.post("/admin/sedes", headers=admin, json={"nombre": "sede bello", "ciudad": "Bello"}).status_code == 400

    publica = next(s for s in cliente.get("/sedes").json() if s["id"] == bello["id"])
    assert publica["direccion"] == "Cl. 50 # 49-20"  # "Cómo llegar" usa la dirección exacta

    r = cliente.put(f"/admin/sedes/{bello['id']}", headers=admin, json={"nombre": "Sede Bello Centro", "ciudad": "Bello"})
    assert (r.json()["nombre"], r.json()["direccion"]) == ("Sede Bello Centro", None)

    # Con un especialista que atiende allí no se puede cerrar: primero se le cambia el horario.
    nueva = cliente.post("/admin/especialistas", headers=admin, json=_nuevo(
        catalogo, turnos=[_turno(0, bello["id"], "07:00", "09:00")]
    )).json()
    r = cliente.patch(f"/admin/sedes/{bello['id']}/estado", headers=admin, json={"activa": False})
    assert r.status_code == 400
    assert r.json()["detail"] == "Antes de cerrar Sede Bello Centro, cambie el horario de: Dra. Prueba Uno."

    cliente.put(f"/admin/especialistas/{nueva['id']}/horario", headers=admin,
                json={"turnos": [_turno(0, catalogo[0]["Sede Poblado"], "07:00", "09:00")]})
    r = cliente.patch(f"/admin/sedes/{bello['id']}/estado", headers=admin, json={"activa": False})
    assert r.status_code == 200 and r.json()["activa"] is False
    assert bello["id"] not in [s["id"] for s in cliente.get("/sedes").json()]  # ya no se ofrece
    # Tampoco se puede usar en un horario.
    cerrada = cliente.put(f"/admin/especialistas/{nueva['id']}/horario", headers=admin,
                          json={"turnos": [_turno(1, bello["id"], "07:00", "09:00")]})
    assert cerrada.status_code == 400 and "cerrada" in cerrada.json()["detail"]

    acciones = [r["accion"] for r in cliente.get("/admin/auditoria", headers=admin).json()]
    assert {"crear_sede", "editar_sede", "desactivar_sede"} <= set(acciones)
    assert cliente.patch(f"/admin/sedes/{bello['id']}/estado", headers=admin, json={"activa": True}).json()["activa"]


def test_solo_el_administrador_gestiona_sedes(cliente, fabrica):
    coordinador = encabezado(fabrica.personal(RolPersonal.COORDINADOR_MEDICO))
    assert cliente.get("/admin/sedes", headers=coordinador).status_code == 403
    assert cliente.post("/admin/sedes", headers=coordinador, json={"nombre": "Sede X", "ciudad": "Y"}).status_code == 403
