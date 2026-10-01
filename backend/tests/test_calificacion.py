"""El paciente califica su atención y el personal ve la satisfacción — HU-71."""

from app.models.cita import EstadoCita
from app.models.personal import RolPersonal
from tests.conftest import encabezado


def _calificar(cliente, paciente, cita, calificacion, comentario=None):
    return cliente.post(
        f"/citas/{cita.id}/calificar",
        headers=encabezado(paciente),
        json={"calificacion": calificacion, "comentario": comentario},
    )


def test_calificar_una_cita_atendida(cliente, fabrica):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    assert cliente.get(f"/citas/{cita.id}", headers=encabezado(paciente)).json()["puede_calificar"] is True

    r = _calificar(cliente, paciente, cita, 4, "  Muy buena atención  ")
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["calificacion"] == 4
    assert datos["comentario_calificacion"] == "Muy buena atención"
    assert datos["puede_calificar"] is False
    assert datos["historial"][-1]["descripcion"] == "Calificó la atención con 4 de 5"


def test_solo_se_califica_una_vez(cliente, fabrica):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    assert _calificar(cliente, paciente, cita, 5).status_code == 200

    r = _calificar(cliente, paciente, cita, 1)
    assert r.status_code == 409
    assert r.json()["detail"] == "Ya calificó esta cita."


def test_no_se_califica_una_cita_no_atendida(cliente, fabrica):
    paciente = fabrica.paciente()
    for estado in (EstadoCita.CONFIRMADA, EstadoCita.NO_ASISTIO, EstadoCita.CANCELADA):
        cita = fabrica.cita(paciente, estado)
        assert cliente.get(f"/citas/{cita.id}", headers=encabezado(paciente)).json()["puede_calificar"] is False
        assert _calificar(cliente, paciente, cita, 5).status_code == 409, estado


def test_calificacion_entre_1_y_5(cliente, fabrica):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    for valor in (0, 6, -1):
        assert _calificar(cliente, paciente, cita, valor).status_code == 422


def test_no_se_califica_la_cita_de_otro_paciente(cliente, fabrica):
    cita = fabrica.cita(fabrica.paciente(), EstadoCita.ATENDIDA)
    assert _calificar(cliente, fabrica.paciente(), cita, 5).status_code == 404


def test_reporte_de_satisfaccion_y_auditoria(cliente, fabrica):
    admin = fabrica.personal(RolPersonal.ADMINISTRADOR)
    antes = cliente.get("/admin/reportes?periodo=anio", headers=encabezado(admin)).json()["satisfaccion"]

    for calificacion in (5, 4, 2):
        paciente = fabrica.paciente()
        _calificar(cliente, paciente, fabrica.cita(paciente, EstadoCita.ATENDIDA), calificacion)

    for periodo in ("mes", "trimestre", "anio"):
        r = cliente.get(f"/admin/reportes?periodo={periodo}", headers=encabezado(admin))
        assert r.status_code == 200, periodo
    despues = r.json()["satisfaccion"]  # el del año

    assert antes["calificaciones"] == 0
    assert despues["calificaciones"] == 3
    assert despues["promedio"] == 3.7
    assert despues["porcentaje_satisfechos"] == 66.7
    assert [d["calificacion"] for d in despues["distribucion"]] == [5, 4, 3, 2, 1]

    auditoria = cliente.get("/admin/auditoria", headers=encabezado(admin)).json()
    assert sum(1 for registro in auditoria if registro["accion"] == "calificar") == 3
