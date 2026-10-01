"""Reglas de negocio que no necesitan base de datos."""

from datetime import date

import pytest

from app.models.cita import Cita
from app.schemas.validators import validar_formato_numero_documento
from app.services import urgencias
from app.services.reportes_service import _satisfaccion, direccion_de_la_tendencia, rango_del_periodo


# --- HU-68: periodos de los reportes ---

@pytest.mark.parametrize(
    "periodo, hoy, esperado",
    [
        ("mes", date(2026, 10, 1), (date(2026, 10, 1), date(2026, 10, 31))),
        ("mes", date(2028, 2, 15), (date(2028, 2, 1), date(2028, 2, 29))),  # año bisiesto
        ("mes", date(2026, 12, 31), (date(2026, 12, 1), date(2026, 12, 31))),
        ("trimestre", date(2026, 10, 1), (date(2026, 10, 1), date(2026, 12, 31))),
        ("trimestre", date(2026, 5, 20), (date(2026, 4, 1), date(2026, 6, 30))),
        ("anio", date(2026, 7, 4), (date(2026, 1, 1), date(2026, 12, 31))),
    ],
)
def test_rango_del_periodo(periodo, hoy, esperado):
    assert rango_del_periodo(periodo, hoy) == esperado


# --- HU-74: dirección de la tendencia de inasistencia ---

@pytest.mark.parametrize(
    "porcentajes, esperado",
    [
        ([10.0, 20.0], "aumenta"),
        ([30.0, 12.5], "disminuye"),
        ([15.0, 15.0], "se_mantiene"),
        ([10.0, None, 5.0, None], "disminuye"),  # ignora los tramos sin citas cerradas
        ([None, 40.0, None], None),  # se necesitan dos tramos con datos
        ([], None),
    ],
)
def test_direccion_de_la_tendencia(porcentajes, esperado):
    assert direccion_de_la_tendencia(porcentajes) == esperado


# --- HU-71: satisfacción ---

def test_satisfaccion_sin_calificaciones():
    resultado = _satisfaccion([Cita(), Cita()])
    assert resultado["calificaciones"] == 0
    assert resultado["promedio"] is None
    assert resultado["porcentaje_satisfechos"] is None
    assert [d["cantidad"] for d in resultado["distribucion"]] == [0, 0, 0, 0, 0]


def test_satisfaccion_promedio_y_satisfechos():
    citas = [Cita(calificacion=n) for n in (5, 4, 4, 2)] + [Cita()]  # una sin calificar
    resultado = _satisfaccion(citas)
    assert resultado["calificaciones"] == 4
    assert resultado["promedio"] == 3.8
    assert resultado["porcentaje_satisfechos"] == 75.0  # 3 de 4 calificaron con 4 o 5
    assert {d["calificacion"]: d["cantidad"] for d in resultado["distribucion"]} == {5: 1, 4: 2, 3: 0, 2: 1, 1: 0}


# --- HU-01 / HU-06: número de documento ---

@pytest.mark.parametrize("numero", ["1020304050", " 123456 ", "123456789012345"])
def test_documento_numerico_valido(numero):
    assert validar_formato_numero_documento(numero) == numero.strip()


@pytest.mark.parametrize("numero", ["12345", "1234567890123456", "AB123456", "1020-3040", ""])
def test_documento_numerico_invalido(numero):
    with pytest.raises(ValueError):
        validar_formato_numero_documento(numero)


def test_pasaporte_admite_letras_y_queda_en_mayusculas():
    assert validar_formato_numero_documento("av123456", permitir_letras=True) == "AV123456"
    with pytest.raises(ValueError):
        validar_formato_numero_documento("AV-123456", permitir_letras=True)


# --- HU-33, criterio 4: urgencias en el asistente ---

@pytest.mark.parametrize(
    "mensaje, categoria",
    [
        ("Me duele el pecho desde hace una hora", "dolor_pecho"),
        ("NO PUEDO RESPIRAR bien", "respiracion"),
        ("mi mamá se desmayó en la cocina", "conciencia"),
        ("tengo un sangrado que no para", "sangrado"),
        ("ya no quiero vivir", "salud_mental"),
    ],
)
def test_detecta_urgencias(mensaje, categoria):
    urgencia = urgencias.detectar(mensaje)
    assert urgencia is not None
    assert urgencia.categoria == categoria


def test_salud_mental_tiene_prioridad_y_su_propio_mensaje():
    urgencia = urgencias.detectar("me duele el pecho y quiero morir")
    assert urgencia.categoria == "salud_mental"
    assert "192" in urgencia.mensaje


@pytest.mark.parametrize("mensaje", ["Quiero agendar una cita de cardiología", "¿Qué sedes tienen?", "Hola"])
def test_mensajes_normales_no_son_urgencia(mensaje):
    assert urgencias.detectar(mensaje) is None
