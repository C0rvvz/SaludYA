"""Panel "Seguridad" del administrador (tipo SIEM / SOC): eventos, alertas y sesiones activas."""

from datetime import datetime, timedelta, timezone

from app.core.security import TIPO_PERSONAL, crear_access_token
from app.models.codigo_otp import CodigoOTP
from app.models.evento_seguridad import EventoSeguridad
from app.models.personal import RolPersonal
from app.services import sesion_service
from app.utils.tiempo import ZONA_COLOMBIA
from tests.conftest import encabezado

CLAVE = "clave-de-prueba-123"  # la que usa la fábrica


def _login(cliente, correo, password=CLAVE):
    return cliente.post("/admin/auth/login", json={"correo": correo, "password": password})


def _panel(cliente, admin, horas=24):
    r = cliente.get(f"/admin/seguridad?horas={horas}", headers=encabezado(admin))
    assert r.status_code == 200, r.text
    return r.json()


def _claves(panel):
    return [a["clave"] for a in panel["alertas"]]


def test_solo_el_administrador_ve_el_panel(cliente, fabrica):
    for rol in (RolPersonal.CALL_CENTER, RolPersonal.AGENDAMIENTO, RolPersonal.COORDINADOR_MEDICO):
        assert cliente.get("/admin/seguridad", headers=encabezado(fabrica.personal(rol))).status_code == 403


def test_ingresos_exitosos_y_fallidos_del_personal(cliente, fabrica):
    admin, persona = fabrica.personal(), fabrica.personal(RolPersonal.CALL_CENTER)
    assert _login(cliente, persona.correo, "otra-clave-equivocada").status_code == 401
    assert _login(cliente, persona.correo).status_code == 200

    panel = _panel(cliente, admin)
    assert panel["indicadores"]["ingresos_fallidos"] == 1
    assert panel["indicadores"]["ingresos_exitosos"] == 1
    fallido = next(e for e in panel["eventos"] if e["tipo"] == "ingreso_fallido")
    assert (fallido["identificador"], fallido["sujeto_nombre"]) == (persona.correo, "Personal call_center (Call center)")
    assert fallido["descripcion"] == "Contraseña incorrecta"
    assert fallido["ip"] == "testclient"
    # La contraseña nunca queda en los eventos.
    assert "otra-clave-equivocada" not in str(panel)


def test_cinco_fallos_bloquean_la_cuenta_y_alertan_fuerza_bruta(cliente, fabrica):
    admin, persona = fabrica.personal(), fabrica.personal(RolPersonal.AGENDAMIENTO)
    for _ in range(5):
        _login(cliente, persona.correo, "incorrecta-1234")
    assert _login(cliente, persona.correo).status_code == 429  # bloqueada, aunque ahora sea la correcta

    panel = _panel(cliente, admin)
    tipos = [e["tipo"] for e in panel["eventos"]]
    assert tipos.count("cuenta_bloqueada") == 1  # una sola vez, al bloquearse
    assert tipos.count("ingreso_bloqueado") == 1
    assert panel["indicadores"]["bloqueos"] == 1
    assert {"fuerza_bruta", "cuenta_bloqueada"} <= set(_claves(panel))
    fuerza = next(a for a in panel["alertas"] if a["clave"] == "fuerza_bruta")
    assert (fuerza["severidad"], fuerza["ip"]) == ("alta", "testclient")
    assert panel["alertas"][0]["severidad"] == "alta"  # las altas primero


def test_probar_varias_cuentas_desde_una_conexion(cliente, fabrica):
    admin = fabrica.personal()
    for correo in ("uno@saludya.test", "dos@saludya.test", "tres@saludya.test"):
        _login(cliente, correo, "cualquier-clave-1")
    panel = _panel(cliente, admin)
    alerta = next(a for a in panel["alertas"] if a["clave"] == "varias_cuentas")
    assert alerta["titulo"] == "Se probaron 3 cuentas desde testclient"
    sin_cuenta = next(e for e in panel["eventos"] if e["identificador"] == "uno@saludya.test")
    assert sin_cuenta["descripcion"] == "Correo que no corresponde a ninguna cuenta"


def test_intentos_sin_permiso(cliente, fabrica):
    admin, call_center = fabrica.personal(), fabrica.personal(RolPersonal.CALL_CENTER)
    for ruta in ("/admin/usuarios", "/admin/auditoria", "/admin/lista-espera"):
        assert cliente.get(ruta, headers=encabezado(call_center)).status_code == 403

    panel = _panel(cliente, admin)
    assert panel["indicadores"]["accesos_denegados"] == 3
    alerta = next(a for a in panel["alertas"] if a["clave"] == "acceso_denegado")
    assert alerta["severidad"] == "alta"  # 3 o más
    assert alerta["cantidad"] == 3
    assert call_center.correo in alerta["sujeto"]
    denegado = next(e for e in panel["eventos"] if e["tipo"] == "acceso_denegado")
    assert "requiere: lista_espera, asignar_prioridad" in denegado["detalle"]


def test_token_de_paciente_o_alterado_en_el_panel_del_personal(cliente, fabrica):
    admin = fabrica.personal()
    assert cliente.get("/admin/citas", headers=encabezado(fabrica.paciente())).status_code == 401
    assert cliente.get("/admin/citas", headers={"Authorization": "Bearer no.es.un-token"}).status_code == 401

    panel = _panel(cliente, admin)
    eventos = [e for e in panel["eventos"] if e["tipo"] == "token_invalido"]
    assert len(eventos) == 1  # se agrupan: uno por conexión cada 5 minutos
    assert "token de paciente usado como personal" in eventos[0]["descripcion"]
    assert "token_invalido" in _claves(panel)


def test_ingreso_del_paciente_con_el_documento_enmascarado(cliente, fabrica, db):
    admin, paciente = fabrica.personal(), fabrica.paciente()
    cliente.post("/auth/paciente/identificar", json={"numero_documento": "99887766554"})
    cliente.post("/auth/paciente/otp/enviar", json={"numero_documento": paciente.numero_documento})
    codigo = db.query(CodigoOTP).filter_by(paciente_id=paciente.id).order_by(CodigoOTP.creado_en.desc()).first().codigo
    incorrecto = "000000" if codigo != "000000" else "111111"
    datos = {"numero_documento": paciente.numero_documento}
    for _ in range(3):
        cliente.post("/auth/paciente/otp/validar", json=datos | {"codigo": incorrecto})

    panel = _panel(cliente, admin)
    tipos = [e["tipo"] for e in panel["eventos"]]
    assert tipos.count("codigo_incorrecto") == 2 and tipos.count("codigo_bloqueado") == 1
    no_registrado = next(e for e in panel["eventos"] if e["tipo"] == "documento_no_registrado")
    assert no_registrado["identificador"] == "Documento terminado en 6554"
    # El documento completo nunca queda en los eventos.
    assert "99887766554" not in str(panel) and paciente.numero_documento not in str(panel)
    assert "codigo_bloqueado" in _claves(panel)


def test_sesiones_activas_y_cerrarlas_a_distancia(cliente, fabrica):
    admin = fabrica.personal()
    persona = fabrica.personal(RolPersonal.CALL_CENTER)
    token = _login(cliente, persona.correo).json()["access_token"]
    yo = encabezado(admin)

    panel = cliente.get("/admin/seguridad", headers=yo).json()
    sesion = next(s for s in panel["sesiones_activas"] if s["identificador"] == persona.correo)
    assert sesion["nombre"] == "Personal call_center (Call center)"

    r = cliente.post(f"/admin/seguridad/sesiones/{sesion['id']}/cerrar", headers=yo)
    assert r.status_code == 204
    rechazada = cliente.get("/admin/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert rechazada.status_code == 401
    assert rechazada.json()["detail"] == "Un administrador cerró su sesión por seguridad. Ingrese de nuevo."
    assert cliente.post(f"/admin/seguridad/sesiones/{sesion['id']}/cerrar", headers=yo).status_code == 400

    panel = cliente.get("/admin/seguridad", headers=yo).json()
    cierre = next(e for e in panel["eventos"] if e["tipo"] == "sesion_cerrada_admin")
    assert cierre["identificador"] == persona.correo and admin.correo in cierre["detalle"]


def test_no_cierra_su_propia_sesion_desde_el_panel(cliente, fabrica, db):
    admin = fabrica.personal()
    sesion = sesion_service.abrir(db, TIPO_PERSONAL, admin.id, "10.0.0.1", "pruebas")
    token, _ = crear_access_token(admin.id, sesion.id, rol=admin.rol.value, tipo=TIPO_PERSONAL)
    r = cliente.post(
        f"/admin/seguridad/sesiones/{sesion.id}/cerrar", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 400
    assert "su propia sesión" in r.json()["detail"]


def test_ingreso_desde_otra_conexion_con_la_sesion_abierta(cliente, fabrica, db):
    admin, persona = fabrica.personal(), fabrica.personal(RolPersonal.AGENDAMIENTO)
    for ip in ("10.0.0.1", "10.0.0.2", "10.0.0.2"):
        sesion_service.abrir(db, TIPO_PERSONAL, persona.id, ip, "Chrome/120 Windows")

    panel = _panel(cliente, admin)
    reemplazos = [e for e in panel["eventos"] if e["tipo"] == "sesion_reemplazada"]
    assert sorted(e["severidad"] for e in reemplazos) == ["info", "media"]  # misma conexión: info
    alerta = next(a for a in panel["alertas"] if a["clave"] == "otra_conexion")
    assert "10.0.0.1" in alerta["descripcion"]
    assert persona.correo in alerta["titulo"]  # quién: lo busca la sesión misma
    assert next(e for e in panel["eventos"] if e["ip"] == "10.0.0.2")["dispositivo"] == "Chrome en Windows"


def test_intentos_sin_no_soy_un_robot(cliente, fabrica, monkeypatch):
    from app.integrations import verificacion_humana

    admin = fabrica.personal()
    monkeypatch.setattr(verificacion_humana, "es_humano", lambda *a: False)
    for _ in range(3):
        assert _login(cliente, "bot@ejemplo.test", "cualquier-clave-1").status_code == 400
    panel = _panel(cliente, admin)
    assert [e["tipo"] for e in panel["eventos"]].count("verificacion_fallida") == 1  # agrupados
    assert "posible_bot" in _claves(panel)
    assert panel["indicadores"]["ingresos_fallidos"] == 0  # no llegó a revisar ninguna contraseña


def test_alerta_al_dar_el_rol_de_administrador(cliente, fabrica):
    admin, persona = fabrica.personal(), fabrica.personal(RolPersonal.AGENDAMIENTO)
    cliente.patch(f"/admin/usuarios/{persona.id}", headers=encabezado(admin), json={"rol": "administrador"})
    alerta = next(a for a in _panel(cliente, admin)["alertas"] if a["clave"] == "nuevo_administrador")
    assert alerta["severidad"] == "alta"
    assert persona.correo in alerta["titulo"]


def test_ingreso_fuera_de_horario_y_periodo(cliente, fabrica, db):
    admin = fabrica.personal()
    ayer_noche = datetime.now(ZONA_COLOMBIA).replace(hour=23, minute=30) - timedelta(days=1)
    db.add(EventoSeguridad(
        fecha=ayer_noche.astimezone(timezone.utc), tipo="ingreso_exitoso", severidad="info", ambito="personal",
        sujeto_nombre="Turno Noche (Call center)", identificador="noche@saludya.test", descripcion="Ingresó",
    ))
    db.commit()
    assert "fuera_de_horario" in _claves(_panel(cliente, admin, horas=48))
    hace_poco = _panel(cliente, admin, horas=1)  # fuera del periodo elegido
    assert "fuera_de_horario" not in _claves(hace_poco)
    assert cliente.get("/admin/seguridad?horas=0", headers=encabezado(admin)).status_code == 422
    assert [c["nombre"] for c in hace_poco["controles"]][0] == "Una sola sesión por cuenta"
