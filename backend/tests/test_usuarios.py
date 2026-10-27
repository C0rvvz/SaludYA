"""Cuentas del personal: inicio de sesión, bloqueo y administración de usuarios."""

from app.models.personal import RolPersonal
from tests.conftest import encabezado

CLAVE = "clave-de-prueba-123"  # la que usa la fábrica


def _login(cliente, correo, password=CLAVE):
    return cliente.post("/admin/auth/login", json={"correo": correo, "password": password})


def test_iniciar_sesion_y_consultar_la_cuenta(cliente, fabrica):
    persona = fabrica.personal(RolPersonal.CALL_CENTER)
    r = _login(cliente, f"  {persona.correo.upper()} ")  # sin importar mayúsculas ni espacios
    assert r.status_code == 200, r.text
    assert r.json()["personal"]["rol_texto"] == "Call center"

    token = r.json()["access_token"]
    yo = cliente.get("/admin/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert yo["correo"] == persona.correo
    assert yo["ultimo_acceso_en"] is not None


def test_credenciales_incorrectas_no_revelan_que_fallo(cliente, fabrica):
    persona = fabrica.personal()
    mala_clave = _login(cliente, persona.correo, "otra-clave-cualquiera")
    no_existe = _login(cliente, "nadie@saludya.test")
    assert mala_clave.status_code == no_existe.status_code == 401
    assert mala_clave.json() == no_existe.json()


def test_bloqueo_tras_cinco_intentos_fallidos(cliente, fabrica):
    persona = fabrica.personal()
    for _ in range(5):
        assert _login(cliente, persona.correo, "incorrecta").status_code == 401
    assert _login(cliente, persona.correo).status_code == 429  # bloqueado aunque ahora sea la correcta


def test_cuenta_inactiva_no_inicia_sesion(cliente, fabrica, db):
    persona = fabrica.personal()
    persona.activo = False
    db.commit()
    assert _login(cliente, persona.correo).status_code == 401


def test_crear_y_editar_usuarios(cliente, fabrica):
    admin = fabrica.personal()
    nuevo = {"nombre": "Laura Call", "correo": "laura@saludya.co", "rol": "call_center", "password": "una-clave-larga-2026"}
    r = cliente.post("/admin/usuarios", headers=encabezado(admin), json=nuevo)
    assert r.status_code == 201, r.text
    # Call center: solo lo de su función (mínimo privilegio).
    assert r.json()["permisos"] == [
        "confirmar_asistencia", "observaciones", "recordatorios", "reprogramar_cancelar", "ver_citas",
    ]

    assert cliente.post("/admin/usuarios", headers=encabezado(admin), json=nuevo).status_code == 400  # correo repetido
    corta = nuevo | {"correo": "otra@saludya.co", "password": "corta"}
    assert cliente.post("/admin/usuarios", headers=encabezado(admin), json=corta).status_code == 422

    r = cliente.patch(
        f"/admin/usuarios/{r.json()['id']}", headers=encabezado(admin),
        json={"nombre": "Laura Coordinadora", "rol": "coordinador_medico", "password": "otra-clave-larga-2026"},
    )
    assert r.json()["rol"] == "coordinador_medico"
    assert _login(cliente, "laura@saludya.co", "otra-clave-larga-2026").status_code == 200

    lista = cliente.get("/admin/usuarios", headers=encabezado(admin)).json()
    assert "laura@saludya.co" in [u["correo"] for u in lista]
    assert cliente.patch(f"/admin/usuarios/{admin.id}x", headers=encabezado(admin), json={}).status_code == 422
    assert cliente.patch(f"/admin/usuarios/{fabrica.paciente().id}", headers=encabezado(admin), json={}).status_code == 400


def test_los_cambios_a_las_cuentas_quedan_en_la_auditoria(cliente, fabrica):
    admin = fabrica.personal()
    nuevo = {"nombre": "Carlos Call", "correo": "carlos@saludya.co", "rol": "call_center", "password": "una-clave-larga-2026"}
    cuenta = cliente.post("/admin/usuarios", headers=encabezado(admin), json=nuevo).json()
    ruta = f"/admin/usuarios/{cuenta['id']}"
    cliente.patch(ruta, headers=encabezado(admin), json={"rol": "agendamiento"})
    cliente.patch(ruta, headers=encabezado(admin), json={"activo": False})
    cliente.patch(ruta, headers=encabezado(admin), json={"activo": True, "password": "otra-clave-larga-2026"})

    registros = cliente.get("/admin/auditoria?categoria=cuentas", headers=encabezado(admin)).json()
    mios = [r for r in registros if r["cuenta_correo"] == "carlos@saludya.co"][::-1]  # del más antiguo al más reciente
    assert [(r["accion"], r["cuenta_rol"], r["estado_anterior"], r["estado_nuevo"]) for r in mios] == [
        ("crear_cuenta", "Call center", None, None),
        ("cambiar_rol", "Call center", "Call center", "Agendamiento"),  # el rol que tenía cuando se cambió
        ("desactivar_cuenta", "Agendamiento", "Activa", "Inactiva"),
        ("activar_cuenta", "Agendamiento", "Inactiva", "Activa"),
        ("cambiar_clave", "Agendamiento", None, None),
    ]
    desactivada = mios[2]
    # Quién (nombre, rol y correo) desactivó a quién (nombre, correo), legible.
    assert desactivada["descripcion"] == "Desactivó la cuenta de Carlos Call"
    assert desactivada["actor_nombre"] == f"{admin.nombre} (Administrador)"
    assert desactivada["actor_correo"] == admin.correo
    assert desactivada["cuenta_nombre"] == "Carlos Call"
    # La contraseña nunca queda en la auditoría.
    assert not any("clave-larga" in str(valor) for r in mios for valor in r.values())

    citas = cliente.get("/admin/auditoria?categoria=citas", headers=encabezado(admin)).json()
    assert all(r["cuenta_nombre"] is None for r in citas)


def test_siempre_queda_un_administrador_activo(cliente, fabrica):
    admin = fabrica.personal()
    r = cliente.patch(f"/admin/usuarios/{admin.id}", headers=encabezado(admin), json={"activo": False})
    assert r.status_code == 400  # no se desactiva a sí mismo

    otro_admin = fabrica.personal()
    r = cliente.patch(f"/admin/usuarios/{otro_admin.id}", headers=encabezado(admin), json={"rol": "agendamiento"})
    assert r.status_code == 200  # quedan otros administradores

    r = cliente.patch(f"/admin/usuarios/{admin.id}", headers=encabezado(otro_admin), json={"activo": False})
    assert r.status_code == 403  # el otro ya no es administrador


def test_no_deja_sin_administradores(db, fabrica):
    import pytest

    from app.models.personal import Personal
    from app.services import personal_service
    from app.services.exceptions import PersonalInvalidoError

    # Solo un administrador activo en toda la base.
    db.query(Personal).filter(Personal.rol == RolPersonal.ADMINISTRADOR).update({"activo": False})
    unico = fabrica.personal()
    quien = fabrica.personal(RolPersonal.AGENDAMIENTO)
    with pytest.raises(PersonalInvalidoError, match="al menos un administrador"):
        personal_service.actualizar(db, unico.id, quien, activo=False)
    with pytest.raises(PersonalInvalidoError, match="nombre"):
        personal_service.actualizar(db, quien.id, unico, nombre="   ")
    with pytest.raises(PersonalInvalidoError, match="nombre"):
        personal_service.crear(db, " ", "x@saludya.test", RolPersonal.AGENDAMIENTO, "clave-suficiente")
