"""Cada médico atiende a los afiliados de una EPS; dos EPS aliadas comparten sus médicos (eps_service)."""

from datetime import timedelta

from app.models.cita import EstadoCita
from app.models.eps import Eps
from app.models.especialista import Especialista
from app.models.lista_espera import EstadoSolicitud, Jornada, SolicitudEspera
from app.models.paciente import EstadoAfiliacion
from app.services import lista_espera_service
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado


def _medico_de(db, eps: str, especialidad_id=None) -> Especialista:
    query = db.query(Especialista).join(Especialista.eps).filter(Eps.nombre == eps)
    if especialidad_id is not None:
        query = query.filter(Especialista.especialidad_id == especialidad_id)
    return query.order_by(Especialista.nombre).first()


def _franja_de(fabrica, medico: Especialista, **datos):
    return fabrica.franja(especialista_id=medico.id, sede_id=medico.sedes[0].id, **datos)


def _agendar(cliente, paciente, franja):
    return cliente.post(
        "/citas", headers=encabezado(paciente),
        json={"disponibilidad_id": str(franja.id), "canal_recordatorio": "whatsapp"},
    )


def test_agenda_con_su_eps_y_las_aliadas_pero_no_con_otras(cliente, fabrica, db):
    sura = db.query(Eps).filter_by(nombre="Sura").one()
    paciente = fabrica.paciente(eps_id=sura.id)
    assert _agendar(cliente, paciente, _franja_de(fabrica, _medico_de(db, "Sura"))).status_code == 201
    # Savia Salud es aliada de Sura: comparten médicos.
    assert _agendar(cliente, paciente, _franja_de(fabrica, _medico_de(db, "Savia Salud"))).status_code == 201

    sanitas = _medico_de(db, "Sanitas")
    r = _agendar(cliente, paciente, _franja_de(fabrica, sanitas))
    assert r.status_code == 400
    assert r.json()["detail"] == (
        f"{sanitas.nombre} atiende a afiliados de Sanitas. Elija un médico de Sura o de una EPS aliada."
    )


def test_un_particular_agenda_con_cualquier_medico(cliente, fabrica, db):
    particular = fabrica.paciente(eps_id=None, estado_afiliacion=EstadoAfiliacion.PARTICULAR)
    for eps in ("Sanitas", "Coosalud", "Sura"):
        assert _agendar(cliente, particular, _franja_de(fabrica, _medico_de(db, eps))).status_code == 201


def test_no_se_reprograma_con_un_medico_de_otra_eps(cliente, fabrica, db):
    sura = db.query(Eps).filter_by(nombre="Sura").one()
    paciente = fabrica.paciente(eps_id=sura.id)
    medico = _medico_de(db, "Sura")
    cita = fabrica.cita(paciente, especialista_id=medico.id, sede_id=medico.sedes[0].id)
    otro = _medico_de(db, "Nueva EPS", medico.especialidad_id)
    franja = _franja_de(fabrica, otro)
    r = cliente.post(f"/citas/{cita.id}/reprogramar", headers=encabezado(paciente),
                     json={"disponibilidad_id": str(franja.id)})
    assert r.status_code == 400 and "Nueva EPS" in r.json()["detail"]
    db.refresh(cita)
    assert cita.estado == EstadoCita.CONFIRMADA  # conserva su cita


def test_la_lista_de_espera_solo_ofrece_cupos_que_puede_usar(fabrica, db, monkeypatch):
    monkeypatch.setattr(lista_espera_service, "enviar_por_canal", lambda *a: True)
    sura = db.query(Eps).filter_by(nombre="Sura").one()
    paciente = fabrica.paciente(eps_id=sura.id)
    sanitas = _medico_de(db, "Sanitas")
    aliado = _medico_de(db, "Savia Salud", sanitas.especialidad_id)
    solicitud = SolicitudEspera(
        paciente_id=paciente.id, especialidad_id=sanitas.especialidad_id, jornada=Jornada.CUALQUIERA,
        canal=paciente_canal(), estado=EstadoSolicitud.EN_ESPERA,
    )
    solicitud.sedes = [sanitas.sedes[0], aliado.sedes[0]]
    db.add(solicitud)
    db.commit()
    dentro_de_5 = hoy_en_colombia() + timedelta(days=5)

    _franja_de(fabrica, sanitas, fecha=dentro_de_5)
    lista_espera_service.asignar_cupos(db)
    db.refresh(solicitud)
    assert solicitud.estado == EstadoSolicitud.EN_ESPERA  # el de Sanitas no se le ofrece

    franja = _franja_de(fabrica, aliado, fecha=dentro_de_5 + timedelta(days=1))
    lista_espera_service.asignar_cupos(db)
    db.refresh(solicitud)
    assert solicitud.estado == EstadoSolicitud.CUPO_OFRECIDO
    assert solicitud.oferta_vigente.disponibilidad_id == franja.id


def paciente_canal():
    from app.models.cita import CanalContacto

    return CanalContacto.WHATSAPP


def test_catalogo_y_paciente_traen_la_eps(cliente, fabrica, db):
    sura = db.query(Eps).filter_by(nombre="Sura").one()
    savia = db.query(Eps).filter_by(nombre="Savia Salud").one()
    paciente = fabrica.paciente(eps_id=sura.id)
    me = cliente.get("/auth/paciente/me", headers=encabezado(paciente)).json()
    assert me["eps_id"] == str(sura.id) and me["eps_aliadas"] == [str(savia.id)]

    _franja_de(fabrica, _medico_de(db, "Sanitas"))
    _franja_de(fabrica, _medico_de(db, "Savia Salud"))
    todas = cliente.get("/disponibilidad/buscar").json()
    assert {"Sanitas", "Savia"} <= {f["especialista"]["eps"]["nombre_corto"] for f in todas}
    para_sura = cliente.get(f"/disponibilidad/buscar?para_eps={sura.id}").json()
    assert {f["especialista"]["eps"]["nombre"] for f in para_sura} <= {"Sura", "Savia Salud"}
    assert "Savia Salud" in {f["especialista"]["eps"]["nombre"] for f in para_sura}

    medicos = cliente.get("/especialistas").json()
    assert all(m["eps"]["nombre_corto"] for m in medicos)
