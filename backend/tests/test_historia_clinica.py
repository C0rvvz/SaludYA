"""Personal › Historia clínica: acceso restringido, el médico solo con sus pacientes, entregas y auditoría."""

import random
from datetime import timedelta

from app.models.auditoria import RegistroAuditoria
from app.models.cita import EstadoCita
from app.models.evento_seguridad import EventoSeguridad
from app.models.formula_medica import Farmacia
from app.models.paciente import EstadoAfiliacion
from app.models.personal import RolPersonal
from app.services import formulas_service
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado

FORMULA = {
    "diagnostico": "Faringitis aguda",
    "cie10": "J02.9",
    "nota": "Tratamiento por 7 días.",
    "medicamentos": [
        {"nombre": "Amoxicilina", "dosis": "500 mg", "indicacion": "1 cápsula cada 8 horas"},
        {"nombre": "Acetaminofén", "dosis": "500 mg", "indicacion": "1 tableta cada 6 horas si hay fiebre"},
    ],
    "recomendaciones": ["Tome mucha agua."],
}


def _con_formula(cliente, fabrica, paciente=None, quien=None, **datos_franja):
    paciente = paciente or fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA, **datos_franja)
    quien = quien or fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    r = cliente.put(f"/admin/historia-clinica/{cita.id}/formula", json=FORMULA, headers=encabezado(quien))
    assert r.status_code == 200, r.text
    return paciente, cita


def test_coordinacion_ve_el_listado_y_el_detalle_y_cada_consulta_queda_en_la_auditoria(cliente, fabrica, db):
    coordinadora = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    rosa, cita = _con_formula(cliente, fabrica, fabrica.paciente(nombre="Rosa Martínez"), coordinadora)
    jorge = fabrica.paciente(nombre="Jorge Pérez")
    fabrica.cita(jorge, EstadoCita.ATENDIDA)  # atendido, sin fórmula todavía
    fabrica.cita(fabrica.paciente(nombre="Sin Atender"))  # solo una cita por venir: no sale

    listado = cliente.get("/admin/historia-clinica", headers=encabezado(coordinadora)).json()
    filas = {f["nombre"]: f for f in listado["pacientes"]}
    assert listado["total"] == 2 and set(filas) == {"Rosa Martínez", "Jorge Pérez"}
    assert filas["Rosa Martínez"]["formula_estado"] == "por_reclamar"
    assert filas["Jorge Pérez"]["formula_estado_texto"] == "Sin fórmula"
    assert filas["Rosa Martínez"]["consultado_en"] is None
    # Búsqueda sin tildes, por documento y filtros.
    buscar = cliente.get("/admin/historia-clinica?buscar=martinez", headers=encabezado(coordinadora)).json()
    assert [f["nombre"] for f in buscar["pacientes"]] == ["Rosa Martínez"]
    por_documento = cliente.get(f"/admin/historia-clinica?buscar={jorge.numero_documento}", headers=encabezado(coordinadora))
    assert por_documento.json()["total"] == 1
    assert cliente.get("/admin/historia-clinica?eps=particular", headers=encabezado(coordinadora)).json()["total"] == 0

    r = cliente.get(f"/admin/historia-clinica/{cita.id}", headers=encabezado(coordinadora))
    assert r.status_code == 200, r.text
    detalle = r.json()
    assert detalle["formula"]["cie10"] == "J02.9" and detalle["formula"]["diagnostico"] == "Faringitis aguda"
    assert detalle["qr"].startswith("data:image/svg+xml") and detalle["puede_editar"] is True
    assert [c["cita_id"] for c in detalle["consultas"]] == [str(cita.id)]
    assert [a["que"] for a in detalle["accesos"]] == ["Registró la fórmula", "Consultó la historia clínica"]
    assert detalle["accesos"][1]["quien"].startswith(coordinadora.nombre)

    # Volver a abrirla enseguida (recargar) no repite el registro.
    cliente.get(f"/admin/historia-clinica/{cita.id}", headers=encabezado(coordinadora))
    vistas = db.query(RegistroAuditoria).filter(RegistroAuditoria.accion == "ver_historia_clinica").all()
    assert len(vistas) == 1 and vistas[0].paciente_id == rosa.id
    assert "Faringitis" not in vistas[0].descripcion
    listado = cliente.get("/admin/historia-clinica", headers=encabezado(coordinadora)).json()
    assert {f["nombre"]: f for f in listado["pacientes"]}["Rosa Martínez"]["consultado_en"] is not None

    # Una cita que no fue atendida no tiene historia clínica.
    futura = fabrica.cita(rosa)
    assert cliente.get(f"/admin/historia-clinica/{futura.id}", headers=encabezado(coordinadora)).status_code == 400


def test_solo_medico_y_coordinacion_la_ven(cliente, fabrica):
    _, cita = _con_formula(cliente, fabrica)
    for rol, codigo in [
        (RolPersonal.ADMINISTRADOR, 403),
        (RolPersonal.CALL_CENTER, 403),
        (RolPersonal.AGENDAMIENTO, 403),
        (RolPersonal.COORDINADOR_MEDICO, 200),
        (RolPersonal.MEDICO, 200),  # es su paciente: lo atendió el médico de ejemplo
    ]:
        quien = encabezado(fabrica.personal(rol))
        assert cliente.get(f"/admin/historia-clinica/{cita.id}", headers=quien).status_code == codigo, rol
        assert cliente.get("/admin/historia-clinica", headers=quien).status_code == codigo, rol


def test_el_medico_solo_ve_a_sus_pacientes_y_corrige_solo_sus_consultas(cliente, fabrica, db):
    medico = fabrica.personal(RolPersonal.MEDICO)  # el médico de ejemplo (fabrica.especialista)
    otro_medico = fabrica.otro_especialista
    suyo, suya = _con_formula(cliente, fabrica)
    # El mismo paciente también fue a otro médico: lo ve (es su paciente), pero no corrige esa fórmula.
    franja_ajena = {"especialista_id": otro_medico.id, "sede_id": otro_medico.sedes[0].id}
    _, ajena_de_su_paciente = _con_formula(cliente, fabrica, suyo, **franja_ajena)
    _, de_otro = _con_formula(cliente, fabrica, **franja_ajena)

    listado = cliente.get("/admin/historia-clinica", headers=encabezado(medico)).json()
    assert [f["paciente_id"] for f in listado["pacientes"]] == [str(suyo.id)]

    assert cliente.get(f"/admin/historia-clinica/{suya.id}", headers=encabezado(medico)).json()["puede_editar"] is True
    r = cliente.get(f"/admin/historia-clinica/{ajena_de_su_paciente.id}", headers=encabezado(medico))
    assert r.status_code == 200 and r.json()["puede_editar"] is False
    r = cliente.put(f"/admin/historia-clinica/{ajena_de_su_paciente.id}/formula", json=FORMULA, headers=encabezado(medico))
    assert r.status_code == 403 and "consultas que usted atendió" in r.json()["detail"]

    r = cliente.get(f"/admin/historia-clinica/{de_otro.id}", headers=encabezado(medico))
    assert r.status_code == 403 and "sus pacientes" in r.json()["detail"]
    # Los dos intentos quedan en los eventos de seguridad.
    eventos = db.query(EventoSeguridad).filter(EventoSeguridad.tipo == "acceso_denegado").all()
    assert {e.sujeto_id for e in eventos} == {medico.id}
    assert any(str(de_otro.id) in e.detalle for e in eventos) and any("/formula" in e.detalle for e in eventos)


def test_entregas_en_farmacia(cliente, fabrica, db):
    coordinadora = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    _, cita = _con_formula(cliente, fabrica, quien=coordinadora)
    db.refresh(cita)
    formula = cita.formula
    aliada = db.query(Farmacia).filter(Farmacia.aliada.is_(True)).first()

    formulas_service.entregar(db, formula, aliada, ["Amoxicilina"])
    db.commit()
    detalle = cliente.get(f"/admin/historia-clinica/{cita.id}", headers=encabezado(coordinadora)).json()["formula"]
    assert detalle["estado_entrega"] == "parcial" and detalle["entregados"] == 1
    assert [m["entregado"] for m in detalle["medicamentos"]] == [True, False]
    assert detalle["farmacia_entrega"] == f"{aliada.nombre} · aliada" and detalle["ultima_entrega_en"]

    # Corregir la fórmula no "des-entrega" lo que ya se entregó.
    corregida = FORMULA | {"nota": "Se corrige la nota."}
    r = cliente.put(f"/admin/historia-clinica/{cita.id}/formula", json=corregida, headers=encabezado(coordinadora))
    assert [m["entregado"] for m in r.json()["formula"]["medicamentos"]] == [True, False]

    formulas_service.entregar(db, formula, aliada, ["Acetaminofén"])
    db.commit()
    detalle = cliente.get(f"/admin/historia-clinica/{cita.id}", headers=encabezado(coordinadora)).json()
    assert detalle["formula"]["estado_entrega_texto"] == "Fórmula entregada"
    farmacia = [a for a in detalle["accesos"] if a["que"] == "Entrega con código"]
    assert farmacia == [farmacia[0] | {"quien": f"{aliada.nombre} (farmacia)", "veces": 2}]

    # Vencida sin reclamar.
    _, otra = _con_formula(cliente, fabrica, quien=coordinadora)
    db.refresh(otra)
    otra.formula.vence_en = hoy_en_colombia() - timedelta(days=1)
    db.commit()
    assert formulas_service.estado_entrega(otra.formula) == "vencida"


def test_la_ips_simula_entregas_de_las_farmacias_aliadas(cliente, fabrica, db):
    for _ in range(4):
        _con_formula(cliente, fabrica)
    entregas = formulas_service.simular_entregas(db, random.Random(7))
    db.commit()
    assert entregas > 0
    entregadas = db.query(RegistroAuditoria).filter(RegistroAuditoria.accion == "entrega_farmacia").all()
    assert len(entregadas) == entregas and all("(farmacia)" in r.actor_nombre for r in entregadas)


def test_reenviar_el_codigo_al_paciente(cliente, fabrica, db, monkeypatch):
    enviados = []
    monkeypatch.setattr(formulas_service, "enviar_por_canal", lambda p, canal, m: enviados.append((canal.value, m)) or True)
    coordinadora = fabrica.personal(RolPersonal.COORDINADOR_MEDICO)
    _, cita = _con_formula(cliente, fabrica, quien=coordinadora)
    enviados.clear()  # el aviso de "ya está su fórmula"

    r = cliente.post(f"/admin/historia-clinica/{cita.id}/reenviar-codigo", headers=encabezado(coordinadora))
    assert r.status_code == 200 and r.json() == {"canal": "whatsapp"}
    db.refresh(cita)
    assert enviados[0][0] == "whatsapp" and cita.formula.codigo in enviados[0][1]
    assert db.query(RegistroAuditoria).filter(RegistroAuditoria.accion == "reenviar_codigo_formula").count() == 1

    cita.formula.vence_en = hoy_en_colombia() - timedelta(days=1)
    db.commit()
    r = cliente.post(f"/admin/historia-clinica/{cita.id}/reenviar-codigo", headers=encabezado(coordinadora))
    assert r.status_code == 400 and "venció" in r.json()["detail"]
    assert cliente.post(f"/admin/historia-clinica/{cita.id}/reenviar-codigo",
                        headers=encabezado(fabrica.personal())).status_code == 403


def test_cuentas_con_el_rol_medico(cliente, fabrica):
    admin = encabezado(fabrica.personal())
    nueva = {"nombre": "Dra. Prueba", "correo": "dra.prueba@saludya.co", "rol": "medico", "password": "una-clave-larga-2026"}
    r = cliente.post("/admin/usuarios", headers=admin, json=nueva)
    assert r.status_code == 400 and "elija qué médico" in r.json()["detail"]

    r = cliente.post("/admin/usuarios", headers=admin, json=nueva | {"especialista_id": str(fabrica.especialista.id)})
    assert r.status_code == 201, r.text
    cuenta = r.json()
    assert cuenta["rol_texto"] == "Médico" and cuenta["especialista"] == fabrica.especialista.nombre
    assert cuenta["permisos"] == ["historia_clinica", "observaciones", "registrar_atencion", "ver_citas"]
    # Un médico, una cuenta.
    otra = nueva | {"correo": "otra@saludya.co", "especialista_id": str(fabrica.especialista.id)}
    r = cliente.post("/admin/usuarios", headers=admin, json=otra)
    assert r.status_code == 400 and "ya tiene una cuenta" in r.json()["detail"]

    # Pasar a otro rol le quita el médico; volver a Médico lo pide de nuevo.
    ruta = f"/admin/usuarios/{cuenta['id']}"
    assert cliente.patch(ruta, headers=admin, json={"rol": "agendamiento"}).json()["especialista_id"] is None
    assert cliente.patch(ruta, headers=admin, json={"rol": "medico"}).status_code == 400
    r = cliente.patch(ruta, headers=admin, json={"rol": "medico", "especialista_id": str(fabrica.otro_especialista.id)})
    assert r.json()["especialista"] == fabrica.otro_especialista.nombre

    # El administrador no tiene la historia clínica; Médico y Coordinación médica sí.
    roles = {r["rol"]: r for r in cliente.get("/admin/roles", headers=admin).json()}
    assert "historia_clinica" not in roles["administrador"]["permisos"]
    assert "historia_clinica" in roles["medico"]["permisos"]
    assert roles["coordinador_medico"]["nombre"] == "Coordinación médica"


def test_un_particular_sale_con_el_filtro_particular(cliente, fabrica):
    particular = fabrica.paciente(nombre="Paciente Particular", eps_id=None, estado_afiliacion=EstadoAfiliacion.PARTICULAR)
    _con_formula(cliente, fabrica, particular)
    filas = cliente.get("/admin/historia-clinica?eps=particular",
                        headers=encabezado(fabrica.personal(RolPersonal.COORDINADOR_MEDICO))).json()["pacientes"]
    assert [f["nombre"] for f in filas] == ["Paciente Particular"] and filas[0]["eps"] is None
