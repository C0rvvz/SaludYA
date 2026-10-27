"""Fórmula médica de una cita atendida, su QR y las farmacias donde reclamarla (y su administración)."""

import random
from datetime import timedelta

from sqlalchemy import text

from app.models.auditoria import RegistroAuditoria
from app.models.cita import EstadoCita
from app.models.formula_medica import Farmacia, FormulaMedica
from app.models.personal import RolPersonal
from app.models.sede import Sede
from app.services import formulas_service, ips_simulada_service
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado

FORMULA = {
    "diagnostico": "Faringitis aguda",
    "nota": "Dolor de garganta desde hace dos días. Tratamiento por 7 días.",
    "medicamentos": [
        {"nombre": "Amoxicilina", "dosis": "500 mg", "indicacion": "1 cápsula cada 8 horas",
         "duracion": "Durante 7 días", "cantidad": "21 cápsulas"},
        {"nombre": "  ", "indicacion": "fila vacía: se ignora"},
    ],
    "recomendaciones": ["Tome mucha agua.", "  "],
}


def _registrar(cliente, quien, cita, datos=FORMULA):
    return cliente.put(f"/admin/citas/{cita.id}/formula", json=datos, headers=encabezado(quien))


def test_el_coordinador_registra_la_formula_y_el_paciente_la_ve(cliente, fabrica, db, monkeypatch):
    avisos = []
    monkeypatch.setattr(formulas_service, "enviar_por_canal", lambda p, canal, mensaje: avisos.append(mensaje))
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    coordinador = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)

    r = _registrar(cliente, coordinador, cita)
    assert r.status_code == 200, r.text
    formula = r.json()["formula"]
    assert formula["codigo"].startswith(f"FM-{hoy_en_colombia().year}-")
    assert formula["vence_en"] == (hoy_en_colombia() + timedelta(days=30)).isoformat()
    assert [m["nombre"] for m in formula["medicamentos"]] == ["Amoxicilina"]  # la fila vacía no cuenta
    assert formula["recomendaciones"] == ["Tome mucha agua."]
    assert len(avisos) == 1 and "/mis-citas" in avisos[0]

    # En Mis citas: "Fórmula lista" y el detalle con el QR y las farmacias.
    citas = cliente.get("/citas?vista=historial", headers=encabezado(paciente)).json()
    assert citas[0]["tiene_formula"] is True
    r = cliente.get(f"/citas/{cita.id}/formula", headers=encabezado(paciente))
    assert r.status_code == 200
    mia = r.json()
    assert mia["diagnostico"] == "Faringitis aguda" and mia["nota"].startswith("Dolor de garganta")
    assert mia["qr"].startswith("data:image/svg+xml")
    assert mia["especialista"] == fabrica.especialista.nombre
    # Primero las farmacias cerca de la sede donde lo atendieron, de la más cercana a la más lejana.
    cercanas = [f for f in mia["farmacias"] if f["sede"] == cita.disponibilidad.sede.nombre]
    assert mia["farmacias"][: len(cercanas)] == cercanas
    assert [f["distancia_km"] for f in cercanas] == sorted(f["distancia_km"] for f in cercanas)
    assert any(f["aliada"] for f in mia["farmacias"]) and not all(f["aliada"] for f in mia["farmacias"])

    # Corregirla no cambia el código ni vuelve a avisar.
    r = _registrar(cliente, coordinador, cita, FORMULA | {"diagnostico": "Amigdalitis aguda"})
    assert r.json()["formula"]["codigo"] == formula["codigo"]
    assert r.json()["formula"]["diagnostico"] == "Amigdalitis aguda"
    assert len(avisos) == 1
    acciones = [a.accion for a in db.query(RegistroAuditoria).filter(RegistroAuditoria.cita_id == cita.id)]
    assert acciones.count("registrar_formula") == 2


def test_lo_medico_queda_cifrado_y_la_auditoria_no_lo_repite(cliente, fabrica, db):
    cita = fabrica.cita(fabrica.paciente(), EstadoCita.ATENDIDA)
    _registrar(cliente, fabrica.personal(), cita)
    crudo = db.execute(
        text("SELECT diagnostico, nota, medicamentos FROM formulas_medicas WHERE cita_id = :id"), {"id": cita.id}
    ).one()
    assert not any("Faringitis" in c or "Amoxicilina" in c or "garganta" in c for c in crudo)
    registro = db.query(RegistroAuditoria).filter(RegistroAuditoria.accion == "registrar_formula").one()
    assert "Faringitis" not in registro.descripcion and "(1 medicamento)" in registro.descripcion


def test_el_qr_lleva_el_codigo_firmado(fabrica, cliente, db):
    cita = fabrica.cita(fabrica.paciente(), EstadoCita.ATENDIDA)
    _registrar(cliente, fabrica.personal(), cita)
    formula = db.query(FormulaMedica).filter(FormulaMedica.cita_id == cita.id).one()
    prefijo, codigo, vence, firma = formulas_service.contenido_qr(formula).split("|")
    assert (prefijo, codigo, vence) == ("SALUDYA-FORMULA", formula.codigo, formula.vence_en.isoformat())
    # Otra fecha (o código) da otra firma: no se puede alargar la vigencia a mano.
    assert firma != formulas_service._firma(codigo, formula.vence_en + timedelta(days=30))
    assert firma == formulas_service._firma(codigo, formula.vence_en)


def test_solo_de_citas_atendidas_y_con_algo_formulado(cliente, fabrica):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    futura = fabrica.cita(paciente)
    r = _registrar(cliente, admin, futura)
    assert r.status_code == 400 and "atendida" in r.json()["detail"]

    atendida = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    vacia = {"diagnostico": "Control", "medicamentos": [], "recomendaciones": []}
    assert _registrar(cliente, admin, atendida, vacia).status_code == 400
    sin_indicacion = FORMULA | {"medicamentos": [{"nombre": "Losartán", "indicacion": ""}]}
    r = _registrar(cliente, admin, atendida, sin_indicacion)
    assert r.status_code == 400 and "cómo tomar Losartán" in r.json()["detail"]


def test_quien_puede_ver_y_registrar_la_formula(cliente, fabrica):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    _registrar(cliente, fabrica.personal(RolPersonal.COORDINADOR_MEDICO), cita)

    # El call center ve la cita, pero no lo médico, y no puede registrarla.
    call_center = fabrica.personal(RolPersonal.CALL_CENTER)
    detalle = cliente.get(f"/admin/citas/{cita.id}", headers=encabezado(call_center)).json()
    assert detalle["formula"] is None and detalle["acciones"]["formula"] is False
    assert _registrar(cliente, call_center, cita).status_code == 403

    # Otro paciente no la ve; y una cita sin fórmula responde 404.
    assert cliente.get(f"/citas/{cita.id}/formula", headers=encabezado(fabrica.paciente())).status_code == 404
    sin_formula = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    assert cliente.get(f"/citas/{sin_formula.id}/formula", headers=encabezado(paciente)).status_code == 404
    citas = {c["id"]: c for c in cliente.get("/citas", headers=encabezado(paciente)).json()}
    assert citas[str(sin_formula.id)]["tiene_formula"] is False


def test_las_farmacias_cerradas_no_aparecen(cliente, fabrica, db):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    _registrar(cliente, fabrica.personal(), cita)
    cerrada = db.query(Farmacia).order_by(Farmacia.nombre).first()
    cerrada.activa = False
    db.commit()
    nombres = [f["nombre"] for f in cliente.get(f"/citas/{cita.id}/formula", headers=encabezado(paciente)).json()["farmacias"]]
    assert cerrada.nombre not in nombres and len(nombres) == db.query(Farmacia).count() - 1


def test_la_ips_manda_la_formula_de_las_citas_atendidas(db, fabrica, monkeypatch):
    monkeypatch.setattr(formulas_service, "enviar_por_canal", lambda *a: True)
    paciente = fabrica.paciente()
    reciente = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    vieja = fabrica.cita(paciente, EstadoCita.ATENDIDA, fecha=hoy_en_colombia() - timedelta(days=60))
    no_asistio = fabrica.cita(paciente, EstadoCita.NO_ASISTIO)

    sincronizacion = ips_simulada_service.sincronizar(db, None, random.Random(3))
    db.refresh(reciente)
    db.refresh(vieja)
    db.refresh(no_asistio)
    assert reciente.formula is not None and reciente.formula.registrada_por == "IPS (actualización simulada)"
    assert vieja.formula is None and no_asistio.formula is None
    assert "fórmula" in sincronizacion.detalle
    # La siguiente no la repite.
    assert formulas_service.simular_desde_ips(db, ips_simulada_service.IPS, random.Random(4)) == 0


# --- Farmacias en el panel del personal ---


def _farmacia(fabrica, **cambios):
    return {
        "nombre": "Droguería Prueba", "barrio": "Belén", "ciudad": "Medellín", "direccion": None,
        "aliada": True, "sede_id": str(fabrica.sede_id), "distancia_km": 0.8,
    } | cambios


def test_el_administrador_agrega_edita_y_cierra_una_farmacia(cliente, fabrica, db):
    admin = fabrica.personal()
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    _registrar(cliente, admin, cita)

    def para_el_paciente():
        r = cliente.get(f"/citas/{cita.id}/formula", headers=encabezado(paciente))
        return {f["nombre"]: f for f in r.json()["farmacias"]}

    r = cliente.post("/admin/farmacias", json=_farmacia(fabrica, nombre="  Droguería   Prueba "), headers=encabezado(admin))
    assert r.status_code == 201, r.text
    nueva = r.json()
    assert nueva["nombre"] == "Droguería Prueba" and nueva["activa"] and nueva["sede"] == cita.disponibilidad.sede.nombre
    assert para_el_paciente()["Droguería Prueba"]["aliada"] is True
    # Mismo nombre en el mismo barrio y ciudad: no se repite.
    r = cliente.post("/admin/farmacias", json=_farmacia(fabrica, nombre="DROGUERÍA PRUEBA"), headers=encabezado(admin))
    assert r.status_code == 400 and "Ya existe Droguería Prueba en Belén" in r.json()["detail"]

    # Editarla: dirección exacta (para "Cómo llegar") y deja de ser aliada.
    cambios = _farmacia(fabrica, direccion="Cra. 76 # 30-12", aliada=False, distancia_km=1.25)
    r = cliente.put(f"/admin/farmacias/{nueva['id']}", json=cambios, headers=encabezado(admin))
    assert r.status_code == 200, r.text
    assert r.json()["direccion"] == "Cra. 76 # 30-12" and r.json()["aliada"] is False
    assert r.json()["distancia_km"] == 1.2
    vista = para_el_paciente()["Droguería Prueba"]
    assert vista["direccion"] == "Cra. 76 # 30-12" and vista["aliada"] is False

    # Cerrada, el paciente ya no la ve; abierta de nuevo, sí.
    r = cliente.patch(f"/admin/farmacias/{nueva['id']}/estado", json={"activa": False}, headers=encabezado(admin))
    assert r.json()["activa"] is False
    assert "Droguería Prueba" not in para_el_paciente()
    listado = cliente.get("/admin/farmacias", headers=encabezado(admin)).json()
    assert listado[-1]["nombre"] == "Droguería Prueba"  # las cerradas al final
    cliente.patch(f"/admin/farmacias/{nueva['id']}/estado", json={"activa": True}, headers=encabezado(admin))
    assert "Droguería Prueba" in para_el_paciente()

    registros = {
        r.accion: r
        for r in db.query(RegistroAuditoria).filter(RegistroAuditoria.accion.like("%farmacia"))
    }
    assert set(registros) == {"crear_farmacia", "editar_farmacia", "desactivar_farmacia", "activar_farmacia"}
    assert registros["crear_farmacia"].detalle.startswith("Aliada · 0,8 km de ")
    assert registros["editar_farmacia"].estado_anterior.startswith("Aliada · 0,8 km")
    assert registros["editar_farmacia"].estado_nuevo.startswith("No aliada · 1,2 km")


def test_validaciones_y_permisos_de_las_farmacias(cliente, fabrica, db):
    admin = fabrica.personal()
    cerrada = Sede(nombre="Sede Cerrada de Prueba", ciudad="Bello", activa=False)
    db.add(cerrada)
    db.commit()

    r = cliente.post("/admin/farmacias", json=_farmacia(fabrica, sede_id=str(cerrada.id)), headers=encabezado(admin))
    assert r.status_code == 400 and r.json()["detail"] == "Elija una sede abierta de la red."
    assert cliente.post("/admin/farmacias", json=_farmacia(fabrica, distancia_km=0), headers=encabezado(admin)).status_code == 422
    assert cliente.post("/admin/farmacias", json=_farmacia(fabrica, barrio="B"), headers=encabezado(admin)).status_code == 422

    # Si su sede se cerró después, puede seguir con ella al editarla.
    farmacia = cliente.post("/admin/farmacias", json=_farmacia(fabrica), headers=encabezado(admin)).json()
    db.get(Farmacia, farmacia["id"]).sede_id = cerrada.id
    db.commit()
    r = cliente.put(f"/admin/farmacias/{farmacia['id']}", json=_farmacia(fabrica, sede_id=str(cerrada.id), aliada=False),
                    headers=encabezado(admin))
    assert r.status_code == 200, r.text

    otra = "00000000-0000-0000-0000-000000000000"
    assert cliente.patch(f"/admin/farmacias/{otra}/estado", json={"activa": False}, headers=encabezado(admin)).status_code == 404
    assert cliente.put(f"/admin/farmacias/{otra}", json=_farmacia(fabrica), headers=encabezado(admin)).status_code == 400

    # Solo el administrador (como las sedes).
    coordinador = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    assert cliente.get("/admin/farmacias", headers=encabezado(coordinador)).status_code == 403
    assert cliente.post("/admin/farmacias", json=_farmacia(fabrica), headers=encabezado(coordinador)).status_code == 403
