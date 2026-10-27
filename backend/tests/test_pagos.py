"""Pagar en línea una cita atendida (simulación de Wompi): tarjeta, PSE, comprobante y código de llegada."""

from sqlalchemy import text

from app.models.auditoria import RegistroAuditoria
from app.models.cita import EstadoCita
from app.services import pagos_service
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado

APROBADA = "4242 4242 4242 4242"
RECHAZADA = "4111 1111 1111 1111"


def _tarjeta(numero=APROBADA, **cambios):
    return {"numero": numero, "cvc": "123", "mes": 12, "anio": hoy_en_colombia().year + 2,
            "titular": "Andrés Gómez"} | cambios


def _atendida(fabrica, db, paciente=None, valor=8000):
    paciente = paciente or fabrica.paciente()
    cita = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    cita.valor = valor
    db.commit()
    return paciente, cita


def _pagar_con_tarjeta(cliente, paciente, cita, numero=APROBADA, cuotas=1):
    r = cliente.post("/pagos/tarjetas/token", json=_tarjeta(numero), headers=encabezado(paciente))
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return cliente.post(f"/citas/{cita.id}/pagos", json={"metodo": "tarjeta", "token": token, "cuotas": cuotas},
                        headers=encabezado(paciente))


def test_pagar_con_tarjeta_aprobada_da_codigo_de_llegada_y_queda_pagada(cliente, fabrica, db):
    paciente, cita = _atendida(fabrica, db)

    # Mis citas › Historial: "Tiene un pago pendiente".
    [mia] = cliente.get("/citas?vista=historial", headers=encabezado(paciente)).json()
    assert mia["pago_pendiente"] is True and mia["pago_referencia"] is None

    resumen = cliente.get(f"/citas/{cita.id}/pago", headers=encabezado(paciente)).json()
    assert resumen["valor"] == 8000 and resumen["pendiente"] is True and resumen["pago"] is None
    assert resumen["concepto"] == f"Copago EPS {fabrica.eps.nombre}"
    assert "Bancolombia" in resumen["bancos"]

    r = _pagar_con_tarjeta(cliente, paciente, cita, cuotas=1)
    assert r.status_code == 201, r.text
    pago = r.json()
    assert pago["estado"] == "aprobado" and pago["valor"] == 8000
    assert pago["referencia"].startswith(f"PAG-{hoy_en_colombia().year}-")
    assert pago["detalle"] == "VISA •••• 4242 · 1 cuota"
    assert len(pago["codigo_llegada"]) == 4 and pago["codigo_llegada"].isdigit()
    assert pago["qr_llegada"].startswith("data:image/svg+xml")

    [mia] = cliente.get("/citas?vista=historial", headers=encabezado(paciente)).json()
    assert mia["pago_pendiente"] is False and mia["pago_referencia"] == pago["referencia"]
    assert mia["historial"][-1]["descripcion"] == "Pagó en línea $8.000"  # en "Estado de su cita"

    # No se puede pagar dos veces.
    r = _pagar_con_tarjeta(cliente, paciente, cita)
    assert r.status_code == 400 and "ya está pagada" in r.json()["detail"]
    acciones = [a.accion for a in db.query(RegistroAuditoria).filter(RegistroAuditoria.cita_id == cita.id)]
    assert acciones.count("pagar_cita") == 1


def test_de_la_tarjeta_solo_se_guarda_la_marca_y_los_ultimos_4(cliente, fabrica, db):
    paciente, cita = _atendida(fabrica, db)
    _pagar_con_tarjeta(cliente, paciente, cita)
    filas = db.execute(text("SELECT * FROM pagos WHERE cita_id = :id"), {"id": cita.id}).mappings().all()
    crudo = " ".join(str(v) for fila in filas for v in fila.values())
    assert "4242424242424242" not in crudo and "4242 4242" not in crudo and "123" not in crudo.split()


def test_tarjeta_rechazada_no_cobra_y_se_puede_intentar_de_nuevo(cliente, fabrica, db):
    paciente, cita = _atendida(fabrica, db)
    r = _pagar_con_tarjeta(cliente, paciente, cita, numero=RECHAZADA)
    assert r.status_code == 201
    assert r.json()["estado"] == "rechazado" and r.json()["codigo_llegada"] is None
    assert "no aprobó" in r.json()["motivo"]
    [mia] = cliente.get("/citas?vista=historial", headers=encabezado(paciente)).json()
    assert mia["pago_pendiente"] is True  # sigue pendiente

    assert _pagar_con_tarjeta(cliente, paciente, cita).json()["estado"] == "aprobado"


def test_solo_sirven_las_tarjetas_de_prueba_y_datos_validos(cliente, fabrica, db):
    paciente, _ = _atendida(fabrica, db)

    def token(**cambios):
        return cliente.post("/pagos/tarjetas/token", json=_tarjeta(**cambios), headers=encabezado(paciente))

    r = token(numero="4000 0000 0000 0002")  # válida (Luhn) pero no es de prueba
    assert r.status_code == 400 and "4242 4242 4242 4242" in r.json()["detail"]
    assert "no es válido" in token(numero="4242 4242 4242 4241").json()["detail"]
    assert "venció" in token(anio=hoy_en_colombia().year - 1).json()["detail"]
    assert "CVC" in token(cvc="12a").json()["detail"]
    assert cliente.post("/pagos/tarjetas/token", json=_tarjeta()).status_code in (401, 403)  # sin sesión


def test_el_token_de_la_tarjeta_sirve_una_sola_vez(cliente, fabrica, db):
    paciente, cita = _atendida(fabrica, db)
    token = cliente.post("/pagos/tarjetas/token", json=_tarjeta(RECHAZADA), headers=encabezado(paciente)).json()["token"]
    cuerpo = {"metodo": "tarjeta", "token": token, "cuotas": 1}
    assert cliente.post(f"/citas/{cita.id}/pagos", json=cuerpo, headers=encabezado(paciente)).status_code == 201
    r = cliente.post(f"/citas/{cita.id}/pagos", json=cuerpo, headers=encabezado(paciente))
    assert r.status_code == 400 and "Escríbalos de nuevo" in r.json()["detail"]


def test_pse_queda_pendiente_hasta_que_responda_en_su_banco(cliente, fabrica, db):
    paciente, cita = _atendida(fabrica, db, valor=12000)
    r = cliente.post(f"/citas/{cita.id}/pagos", json={"metodo": "pse", "banco": "Bancolombia", "correo": "a@b.co"},
                     headers=encabezado(paciente))
    assert r.status_code == 201, r.text
    pago = r.json()
    assert pago["estado"] == "pendiente" and pago["detalle"] == "PSE · Bancolombia" and pago["valor"] == 12000

    r = cliente.post(f"/pagos/{pago['referencia']}/banco", json={"autoriza": True}, headers=encabezado(paciente))
    assert r.json()["estado"] == "aprobado" and len(r.json()["codigo_llegada"]) == 4
    # Si vuelve atrás y responde otra vez, no cambia nada.
    r = cliente.post(f"/pagos/{pago['referencia']}/banco", json={"autoriza": False}, headers=encabezado(paciente))
    assert r.json()["estado"] == "aprobado"


def test_pse_cancelado_en_el_banco_queda_rechazado(cliente, fabrica, db):
    paciente, cita = _atendida(fabrica, db)
    referencia = cliente.post(f"/citas/{cita.id}/pagos", json={"metodo": "pse", "banco": "Nequi"},
                              headers=encabezado(paciente)).json()["referencia"]
    r = cliente.post(f"/pagos/{referencia}/banco", json={"autoriza": False}, headers=encabezado(paciente))
    assert r.json()["estado"] == "rechazado" and "Canceló" in r.json()["motivo"]
    assert cliente.get(f"/pagos/{referencia}", headers=encabezado(paciente)).json()["estado"] == "rechazado"

    r = cliente.post(f"/citas/{cita.id}/pagos", json={"metodo": "pse", "banco": "Banco Inventado"},
                     headers=encabezado(paciente))
    assert r.status_code == 400 and "Elija su banco" in r.json()["detail"]


def test_solo_se_pagan_citas_atendidas_y_propias(cliente, fabrica, db):
    paciente, cita = _atendida(fabrica, db)
    otro = fabrica.paciente()
    assert cliente.get(f"/citas/{cita.id}/pago", headers=encabezado(otro)).status_code == 404
    r = cliente.post(f"/citas/{cita.id}/pagos", json={"metodo": "pse", "banco": "Nequi"}, headers=encabezado(otro))
    assert r.status_code == 404

    futura = fabrica.cita(paciente)
    futura.valor = 8000
    db.commit()
    r = cliente.post(f"/citas/{futura.id}/pagos", json={"metodo": "pse", "banco": "Nequi"},
                     headers=encabezado(paciente))
    assert r.status_code == 400 and "después de que lo atiendan" in r.json()["detail"]
    assert cliente.get(f"/citas/{futura.id}/pago", headers=encabezado(paciente)).json()["pendiente"] is False

    _, gratis = _atendida(fabrica, db, paciente, valor=0)
    r = cliente.post(f"/citas/{gratis.id}/pagos", json={"metodo": "pse", "banco": "Nequi"},
                     headers=encabezado(paciente))
    assert r.status_code == 400 and "nada que pagar" in r.json()["detail"]

    # Otro paciente no ve el pago ajeno por su referencia.
    referencia = _pagar_con_tarjeta(cliente, paciente, cita).json()["referencia"]
    assert cliente.get(f"/pagos/{referencia}", headers=encabezado(otro)).status_code == 404


def test_enviar_el_comprobante_por_el_canal_que_elija(cliente, fabrica, db, monkeypatch):
    enviados = []
    monkeypatch.setattr(pagos_service, "enviar_por_canal", lambda p, canal, m: enviados.append((canal.value, m)) or True)
    paciente, cita = _atendida(fabrica, db)
    pago = _pagar_con_tarjeta(cliente, paciente, cita).json()

    r = cliente.post(f"/pagos/{pago['referencia']}/comprobante", json={"canal": "whatsapp"}, headers=encabezado(paciente))
    assert r.status_code == 200 and "WhatsApp" in r.json()["mensaje"]
    canal, mensaje = enviados[0]
    assert canal == "whatsapp" and "$8.000" in mensaje and pago["referencia"] in mensaje
    assert pago["codigo_llegada"] in mensaje

    # Sin correo en la cuenta, no se puede elegir correo.
    r = cliente.post(f"/pagos/{pago['referencia']}/comprobante", json={"canal": "correo"}, headers=encabezado(paciente))
    assert r.status_code == 400 and "no tiene correo" in r.json()["detail"]
    r = cliente.post(f"/pagos/{pago['referencia']}/comprobante", json={"canal": "llamada"}, headers=encabezado(paciente))
    assert r.status_code == 422


def test_no_se_envia_comprobante_de_un_pago_rechazado(cliente, fabrica, db):
    paciente, cita = _atendida(fabrica, db)
    pago = _pagar_con_tarjeta(cliente, paciente, cita, numero=RECHAZADA).json()
    r = cliente.post(f"/pagos/{pago['referencia']}/comprobante", json={"canal": "sms"}, headers=encabezado(paciente))
    assert r.status_code == 400 and "aprobado" in r.json()["detail"]
