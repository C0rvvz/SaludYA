"""
Asistente conversacional — HU-33. Sin proveedor de IA real: las
respuestas del modelo se simulan, y las funciones (tools) se prueban
directamente contra la base de pruebas.
"""

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import openai
import pytest
from openai.types.chat import ChatCompletionMessage

from app.core import limite_intentos
from app.core.config import settings
from app.models import Especialidad, Especialista, Sede
from app.models.cita import CanalContacto, EstadoCita
from app.models.solicitud_cita import TipoCita, TipoSolicitud
from app.services import chatbot, herramientas_ia, ia, solicitudes_service
from app.services.exceptions import AsistenteNoDisponibleError
from app.services.herramientas_ia import EstadoConversacion
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado


def _llamar(db, paciente, estado, nombre, **args):
    return herramientas_ia.ejecutar(db, paciente, estado, nombre, json.dumps(args, default=str))


@pytest.fixture
def especialidad(fabrica):
    return fabrica.especialista.especialidad.nombre


# --- Tools: validación de lo que pide el modelo ---

def test_funcion_desconocida_o_argumentos_invalidos(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    assert "no está disponible" in _llamar(db, paciente, estado, "borrar_todo")["error"]
    assert "JSON" in herramientas_ia.ejecutar(db, paciente, estado, "buscar_sedes", "{roto")["error"]
    assert "objeto" in herramientas_ia.ejecutar(db, paciente, estado, "buscar_sedes", "[1]")["error"]
    assert "Parámetros inválidos" in _llamar(db, paciente, estado, "buscar_horarios", inventado=1)["error"]


def test_catalogo(db, fabrica, especialidad):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    assert especialidad in _llamar(db, paciente, estado, "buscar_especialidades")["especialidades"]
    sedes = _llamar(db, paciente, estado, "buscar_sedes")["sedes"]
    assert {"nombre", "ciudad"} <= set(sedes[0])
    assert {"Sede Bello", "Sede Manrique"} <= {s["nombre"] for s in sedes}


def test_buscar_horarios_entiende_nombres_sin_tildes_y_parciales(db, fabrica, especialidad):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    fecha = hoy_en_colombia() + timedelta(days=10)
    franjas = [fabrica.franja(fecha=fecha) for _ in range(9)]
    sede = db.get(Sede, fabrica.sede_id)

    r = _llamar(
        db, paciente, estado, "buscar_horarios",
        especialidad=especialidad.upper().replace("Í", "I"), sede=sede.nombre.split()[-1].lower(), fecha=fecha,
    )
    assert r["total"] == 9
    assert len(r["horarios"]) == 8  # tope de resultados
    assert "primeros 8" in r["nota"]
    assert {h["disponibilidad_id"] for h in r["horarios"]} <= {str(f.id) for f in franjas}
    assert len(estado.horarios_ofrecidos) == 8  # el backend recuerda lo que mostró


def test_buscar_horarios_errores_y_alternativas(db, fabrica, especialidad):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    assert "coincide con varias" in _llamar(db, paciente, estado, "buscar_horarios", sede="Sede")["error"]
    assert "no está entre" in _llamar(db, paciente, estado, "buscar_horarios", especialidad="Neurocirugía")["error"]
    error = _llamar(db, paciente, estado, "buscar_horarios", sede="Sede Envigado", ciudad="Medellin")["error"]
    assert "queda en Envigado" in error
    ayer = hoy_en_colombia() - timedelta(days=1)
    assert "ya pasó" in _llamar(db, paciente, estado, "buscar_horarios", fecha=ayer)["error"]

    fabrica.franja()
    lejos = hoy_en_colombia() + timedelta(days=300)
    r = _llamar(db, paciente, estado, "buscar_horarios", especialidad=especialidad, fecha=lejos)
    assert r["total"] == 0
    assert r["alternativas"]  # no se niega la cita si hay cupo en otra fecha


def test_crear_cita_exige_confirmacion_en_un_mensaje_posterior(db, fabrica, especialidad):
    paciente, estado = fabrica.paciente(), EstadoConversacion(turno=1)
    fecha = hoy_en_colombia() + timedelta(days=10)
    fabrica.franja(fecha=fecha)
    horario = _llamar(db, paciente, estado, "buscar_horarios", especialidad=especialidad, fecha=fecha)["horarios"][0]
    datos = {"disponibilidad_id": horario["disponibilidad_id"], "canal_recordatorio": "whatsapp"}

    assert _llamar(db, paciente, estado, "crear_cita", **datos)["requiere_confirmacion"]
    # El modelo no puede confirmar por su cuenta en el mismo turno.
    assert _llamar(db, paciente, estado, "crear_cita", **datos)["requiere_confirmacion"]

    estado.turno += 1  # el paciente respondió "sí"
    creada = _llamar(db, paciente, estado, "crear_cita", **datos)
    assert creada["cita"]["numero_comprobante"]
    assert estado.eventos[-1][0] == "cita_agendada"
    repetida = _llamar(db, paciente, estado, "crear_cita", **datos)
    assert "ya había quedado" in repetida["nota"]  # no se agenda dos veces

    inventado = _llamar(db, paciente, estado, "crear_cita", disponibilidad_id=str(paciente.id), canal_recordatorio="sms")
    assert "no salió de ninguna búsqueda" in inventado["error"]


def test_crear_cita_si_otro_tomo_el_horario(db, fabrica, especialidad):
    paciente, estado = fabrica.paciente(), EstadoConversacion(turno=1)
    fecha = hoy_en_colombia() + timedelta(days=10)
    franja = fabrica.franja(fecha=fecha)
    _llamar(db, paciente, estado, "buscar_horarios", especialidad=especialidad, fecha=fecha)
    datos = {"disponibilidad_id": str(franja.id), "canal_recordatorio": "correo"}
    _llamar(db, paciente, estado, "crear_cita", **datos)

    fabrica.db.query(type(franja)).filter_by(id=franja.id).update({"estado": "reservado"})
    estado.turno += 1
    assert "ya no está disponible" in _llamar(db, paciente, estado, "crear_cita", **datos)["error"]


def test_consultar_citas_e_historial(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    proxima = fabrica.cita(paciente)
    for _ in range(6):
        fabrica.cita(paciente, EstadoCita.ATENDIDA)

    r = _llamar(db, paciente, estado, "consultar_cita", numero_comprobante=None)
    assert [c["numero_comprobante"] for c in r["citas"]] == [proxima.numero_comprobante]
    r = _llamar(db, paciente, estado, "consultar_cita", numero_comprobante=proxima.numero_comprobante.lower())
    assert r["citas"][0]["estado"] == "Pendiente de confirmar asistencia"
    assert "ninguna cita" in _llamar(db, paciente, estado, "consultar_cita", numero_comprobante="SY-NOEXISTE")["error"]

    historial = _llamar(db, paciente, estado, "consultar_historial")
    assert historial["total"] == 6
    assert len(historial["citas"]) == 5
    assert "nota" in historial

    ajena = fabrica.cita(fabrica.paciente())  # el modelo no llega a citas de otro paciente
    assert "error" in _llamar(db, paciente, estado, "consultar_cita", numero_comprobante=ajena.numero_comprobante)


def test_confirmar_asistencia_y_llegada(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    cita = fabrica.cita(paciente)
    assert _llamar(db, paciente, estado, "confirmar_asistencia", numero_comprobante=cita.numero_comprobante)["cita"]
    assert estado.eventos[-1][0] == "asistencia_confirmada"
    assert "temprano" in _llamar(db, paciente, estado, "registrar_llegada", numero_comprobante=cita.numero_comprobante)["error"]

    pasada = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    assert "error" in _llamar(db, paciente, estado, "confirmar_asistencia", numero_comprobante=pasada.numero_comprobante)


def test_cancelar_por_el_asistente(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion(turno=1)
    cita = fabrica.cita(paciente)
    datos = {"numero_comprobante": cita.numero_comprobante, "motivo": "Viaje"}

    assert _llamar(db, paciente, estado, "cancelar_cita", **datos)["requiere_confirmacion"]
    estado.turno += 1
    assert _llamar(db, paciente, estado, "cancelar_cita", **datos)["mensaje"] == "Cita cancelada y cupo liberado."
    assert "no se puede cancelar" in _llamar(db, paciente, estado, "cancelar_cita", **datos)["error"]


def test_reprogramar_por_el_asistente(db, fabrica, especialidad):
    paciente, estado = fabrica.paciente(), EstadoConversacion(turno=1)
    cita = fabrica.cita(paciente)
    fecha = hoy_en_colombia() + timedelta(days=12)
    nueva = fabrica.franja(fecha=fecha)

    sin_buscar = {"numero_comprobante": cita.numero_comprobante, "nueva_disponibilidad_id": str(nueva.id)}
    assert "no salió de ninguna búsqueda" in _llamar(db, paciente, estado, "reprogramar_cita", **sin_buscar)["error"]

    _llamar(db, paciente, estado, "buscar_horarios", especialidad=especialidad, fecha=fecha)
    assert _llamar(db, paciente, estado, "reprogramar_cita", **sin_buscar)["requiere_confirmacion"]
    estado.turno += 1
    r = _llamar(db, paciente, estado, "reprogramar_cita", **sin_buscar)
    assert r["cita_anterior"] == cita.numero_comprobante.upper()
    assert estado.eventos[-1][0] == "cita_reprogramada"
    assert "no se puede reprogramar" in _llamar(db, paciente, estado, "reprogramar_cita", **sin_buscar)["error"]


# --- Valores, peticiones, lista de espera y botones a otras pantallas ---

def _medico(db, nombre):
    return db.query(Especialista).filter(Especialista.nombre == nombre).one()


def test_valores_de_la_consulta_segun_el_medico_y_pagos_pendientes(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    atendida = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    atendida.valor = 8000
    db.commit()

    r = _llamar(db, paciente, estado, "consultar_valores")
    assert r["su_eps"] == "Sura"
    assert [(v["con"], v["valor"]) for v in r["valores"]] == [
        ("Médicos de su EPS (Sura)", "$8.000"),
        ("Médicos de EPS aliadas a la suya (Savia Salud)", "$12.000"),
        ("Médicos particulares (sin EPS)", "$100.000"),
    ]
    red = {e["eps"]: e for e in r["eps_con_medicos_en_saludya"]}
    assert {"Sura", "Savia Salud", "Nueva EPS"} <= set(red)
    assert red["Sura"]["medicos"] > 0 and red["Sura"]["comparte_medicos_con"] == ["Savia Salud"]
    assert r["medicos_particulares"] >= 4
    assert any("todas las EPS" in regla for regla in r["reglas"])
    assert r["pagos_pendientes"] == [{
        "numero_comprobante": atendida.numero_comprobante, "especialidad": "Ortopedia",
        "fecha": atendida.disponibilidad.fecha.isoformat(), "valor": "$8.000",
    }]

    sin_eps = fabrica.paciente(eps_id=None)
    r = _llamar(db, sin_eps, estado, "consultar_valores")
    assert r["su_eps"] is None
    assert [v["valor"] for v in r["valores"]] == ["$100.000"]


def test_horarios_con_su_valor_y_los_particulares_solo_si_los_pide(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    fecha = hoy_en_colombia() + timedelta(days=10)
    de_sura, particular = _medico(db, "Dra. Adriana Lopera"), _medico(db, "Dr. Mauricio Gil")
    fabrica.franja(fecha=fecha, especialista_id=de_sura.id, sede_id=de_sura.sedes[0].id)
    fabrica.franja(fecha=fecha, especialista_id=particular.id, sede_id=particular.sedes[0].id)

    r = _llamar(db, paciente, estado, "buscar_horarios", especialidad="Médico general", fecha=fecha)
    assert [(h["profesional"], h["valor_consulta"], h["cobro"]) for h in r["horarios"]] == [
        ("Dra. Adriana Lopera", "$8.000", "copago de su EPS (Sura)"),
    ]
    assert r["horarios_con_particulares"] == 1 and "$100.000" in r["nota_particulares"]

    r = _llamar(db, paciente, estado, "buscar_horarios", especialidad="Médico general", fecha=fecha,
                incluir_particulares=True)
    valores = {h["profesional"]: (h["eps_del_medico"], h["valor_consulta"]) for h in r["horarios"]}
    assert valores["Dr. Mauricio Gil"] == ("Particular (sin EPS)", "$100.000")
    assert "horarios_con_particulares" not in r


def test_especialidades_sin_medicos(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion()
    catalogo = _llamar(db, paciente, estado, "buscar_especialidades")
    assert "Oncología" in catalogo["sin_medicos_por_ahora"] and "Oncología" not in catalogo["especialidades"]
    r = _llamar(db, paciente, estado, "buscar_horarios", especialidad="oncologia")
    assert r["total"] == 0 and "no hay médicos de Oncología" in r["nota"]
    error = _llamar(db, paciente, estado, "unirse_lista_espera", especialidad="Oncología", sede=None,
                    jornada="manana", modalidad=None, canal="whatsapp")["error"]
    assert "no hay médicos de Oncología" in error and "petición" in error


def test_consultar_peticiones_sin_mandarle_al_modelo_el_motivo(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion(turno=1)
    vacia = _llamar(db, paciente, estado, "consultar_peticiones")
    assert vacia["total"] == 0 and estado.enlaces == []

    solicitudes_service.radicar(
        db, paciente, TipoSolicitud.FORMAL, fabrica.especialidad_id, TipoCita.PRIMERA_VEZ,
        hoy_en_colombia() + timedelta(days=5), "Me operan el 15 y necesito la cita antes", CanalContacto.WHATSAPP,
    )
    r = _llamar(db, paciente, estado, "consultar_peticiones")
    peticion = r["peticiones"][0]
    assert (peticion["tipo"], peticion["especialidad"], peticion["estado"]) == (
        "Petición de cita", "Ortopedia", "En revisión por el personal de SaludYA"
    )
    assert peticion["numero_radicado"].startswith("RAD-")
    assert "operan" not in json.dumps(r, ensure_ascii=False)  # el motivo es dato de salud: no va al modelo
    assert estado.enlaces == [(1, {"texto": "Ver mis peticiones", "ruta": "/solicitudes"})]


def test_inscribirse_en_la_lista_de_espera_con_confirmacion(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion(turno=1)
    assert _llamar(db, paciente, estado, "consultar_lista_espera")["total"] == 0
    datos = {"especialidad": "ortopedia", "sede": None, "jornada": "manana", "modalidad": None, "canal": "sms"}

    propuesta = _llamar(db, paciente, estado, "unirse_lista_espera", **datos)
    assert propuesta["requiere_confirmacion"]
    assert propuesta["resumen"]["horario_preferido"] == "en la mañana"
    assert "Sede Envigado" in propuesta["resumen"]["sedes"]

    estado.turno += 1  # el paciente dijo que sí
    inscrito = _llamar(db, paciente, estado, "unirse_lista_espera", **datos)
    assert inscrito["mensaje"] == "Quedó inscrito en la lista de espera." and inscrito["puesto"] == 1
    assert estado.enlaces[-1][1] == {"texto": "Ver mi lista de espera", "ruta": "/lista-espera"}

    lista = _llamar(db, paciente, estado, "consultar_lista_espera")["listas"][0]
    assert (lista["especialidad"], lista["puesto"]) == ("Ortopedia", 1)
    estado.turno += 1
    assert "ya está en la lista" in _llamar(db, paciente, estado, "unirse_lista_espera", **datos)["error"]


def test_botones_a_otras_pantallas(db, fabrica):
    paciente, estado = fabrica.paciente(), EstadoConversacion(turno=1)
    oncologia = db.query(Especialidad).filter(Especialidad.nombre == "Oncología").one()

    r = _llamar(db, paciente, estado, "ofrecer_enlace", destino="peticion", especialidad="Oncologia",
                numero_comprobante=None)
    assert r["boton"] == "Solicitar petición"
    assert estado.enlaces == [(1, {"texto": "Solicitar petición", "ruta": f"/solicitudes?tipo=formal&especialidad={oncologia.id}"})]

    atendida = fabrica.cita(paciente, EstadoCita.ATENDIDA)
    pagar = {"destino": "pagar_cita", "especialidad": None, "numero_comprobante": atendida.numero_comprobante}
    assert "no tiene un pago pendiente" in _llamar(db, paciente, estado, "ofrecer_enlace", **pagar)["error"]
    atendida.valor = 12000
    db.commit()
    _llamar(db, paciente, estado, "ofrecer_enlace", **pagar)
    assert estado.enlaces[-1][1] == {"texto": "Pagar $12.000", "ruta": f"/pagar/{atendida.id}"}

    # Máximo 2 por mensaje; en el mensaje siguiente se empieza de cero.
    _llamar(db, paciente, estado, "ofrecer_enlace", destino="mis_citas", especialidad=None, numero_comprobante=None)
    assert len(estado.enlaces) == 2
    estado.turno += 1
    _llamar(db, paciente, estado, "ofrecer_enlace", destino="mis_citas", especialidad=None, numero_comprobante=None)
    assert estado.enlaces == [(2, {"texto": "Ver mis citas", "ruta": "/mis-citas"})]
    assert "Parámetros inválidos" in _llamar(db, paciente, estado, "ofrecer_enlace", destino="https://otro.sitio",
                                              especialidad=None, numero_comprobante=None)["error"]


# --- Conversación completa (chatbot.py) con el modelo simulado ---

def _mensaje(texto=None, *llamadas):
    return ChatCompletionMessage.model_validate({
        "role": "assistant",
        "content": texto,
        "tool_calls": [
            {"id": f"c{i}", "type": "function", "function": {"name": nombre, "arguments": json.dumps(args)}}
            for i, (nombre, args) in enumerate(llamadas)
        ] or None,
    })


@pytest.fixture
def modelo(monkeypatch):
    """Respuestas que dará el modelo, en orden; guarda lo que se le envió."""
    respuestas, enviados, plazos = [], [], []

    def completar(mensajes, usar_tools=True, hasta=None):
        enviados.append(mensajes)
        plazos.append(hasta)
        respuesta = respuestas.pop(0)
        if isinstance(respuesta, Exception):
            raise respuesta
        return respuesta

    monkeypatch.setattr(ia, "completar", completar)
    return SimpleNamespace(respuestas=respuestas, enviados=enviados, plazos=plazos)


def test_conversacion_con_funciones(cliente, fabrica, modelo):
    paciente = fabrica.paciente()
    modelo.respuestas += [_mensaje(None, ("buscar_especialidades", {})), _mensaje("Tenemos estas especialidades.")]

    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "¿Qué especialidades hay?"})
    assert r.json() == {
        "respuesta": "Tenemos estas especialidades.", "tipo": "mensaje", "cita": None, "propuesta": None, "enlaces": [],
    }
    resultado_tool = modelo.enviados[1][-1]
    assert resultado_tool["role"] == "tool"
    assert "especialidades" in resultado_tool["content"]
    assert paciente.nombre in modelo.enviados[0][0]["content"]  # mensaje de sistema con su nombre

    historial = cliente.get("/chat", headers=encabezado(paciente)).json()
    assert [m["rol"] for m in historial] == ["paciente", "asistente"]
    assert cliente.delete("/chat", headers=encabezado(paciente)).status_code == 204
    assert cliente.get("/chat", headers=encabezado(paciente)).json() == []


def test_la_cita_propuesta_llega_como_tarjeta_hasta_que_se_confirma(cliente, fabrica, modelo, especialidad):
    paciente = fabrica.paciente()
    fecha = hoy_en_colombia() + timedelta(days=10)
    franja = fabrica.franja(fecha=fecha)
    buscar = {"especialidad": especialidad, "fecha": fecha.isoformat()}
    crear = {"disponibilidad_id": str(franja.id), "canal_recordatorio": "whatsapp"}
    modelo.respuestas += [
        _mensaje(None, ("buscar_horarios", buscar)),
        _mensaje(None, ("crear_cita", crear)),
        _mensaje("Le propongo esta cita. ¿Confirma la cita?"),
    ]
    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Quiero una cita"}).json()
    assert r["tipo"] == "mensaje"
    assert r["propuesta"]["especialidad"] == especialidad
    assert r["propuesta"]["especialidad_id"] == str(fabrica.especialista.especialidad_id)
    assert r["propuesta"]["fecha"] == fecha.isoformat()

    # En el mensaje siguiente, sin volver a proponer, ya no se repite la tarjeta.
    modelo.respuestas += [_mensaje("¿Algo más?")]
    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Déjeme pensarlo"}).json()
    assert r["propuesta"] is None

    # Al confirmar, llega la cita agendada y no la propuesta.
    modelo.respuestas += [_mensaje(None, ("crear_cita", crear)), _mensaje("Listo, quedó agendada.")]
    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Sí, confirmo"}).json()
    assert r["tipo"] == "cita_agendada"
    assert r["propuesta"] is None


def test_el_boton_llega_con_la_respuesta_de_ese_mensaje(cliente, fabrica, modelo):
    paciente = fabrica.paciente()
    enlace = {"destino": "derecho_de_peticion", "especialidad": None, "numero_comprobante": None}
    modelo.respuestas += [
        _mensaje(None, ("ofrecer_enlace", enlace)),
        _mensaje("El derecho de petición se radica en su formulario. Use el botón de abajo."),
    ]
    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Quiero poner un derecho de petición"})
    assert r.json()["enlaces"] == [{"texto": "Radicar derecho de petición", "ruta": "/solicitudes?tipo=derecho_peticion"}]

    modelo.respuestas += [_mensaje("¿En qué más le puedo servir?")]
    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Gracias"})
    assert r.json()["enlaces"] == []


def test_las_instrucciones_piden_un_tono_profesional_y_conocen_saludya():
    texto = ia.instrucciones_sistema("Laura")
    assert "Tono profesional" in texto and "usted" in texto
    assert "consultar_valores" in texto and "ofrecer_enlace" in texto
    assert "le reserva por 2 horas" in texto  # el plazo de la lista de espera, de la configuración
    nombres = {t["function"]["name"] for t in ia.TOOLS}
    assert {"consultar_valores", "consultar_peticiones", "consultar_lista_espera", "unirse_lista_espera",
            "ofrecer_enlace"} <= nombres
    assert "unirse_lista_espera" in ia.TOOLS_ESCRITURA and "ofrecer_enlace" in ia.TOOLS_LECTURA


def test_una_sola_escritura_por_mensaje_y_tarjeta_de_la_cita(cliente, fabrica, modelo):
    paciente = fabrica.paciente()
    cita = fabrica.cita(paciente)
    numero = {"numero_comprobante": cita.numero_comprobante}
    modelo.respuestas += [
        _mensaje(None, ("confirmar_asistencia", numero), ("cancelar_cita", numero | {"motivo": None})),
        _mensaje("Listo, confirmé su asistencia."),
    ]
    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Sí voy a ir"}).json()
    assert r["tipo"] == "asistencia_confirmada"
    assert r["cita"]["numero_comprobante"] == cita.numero_comprobante
    segunda = json.loads(modelo.enviados[1][-1]["content"])
    assert "Solo se puede hacer una acción" in segunda["error"]


def test_urgencia_responde_sin_llamar_al_modelo(cliente, fabrica, modelo):
    r = cliente.post("/chat", headers=encabezado(fabrica.paciente()), json={"mensaje": "No puedo respirar"})
    assert r.json()["tipo"] == "urgencia"
    assert "123" in r.json()["respuesta"]
    assert modelo.enviados == []


def test_modelo_que_no_cierra_o_responde_vacio(db, fabrica, modelo):
    paciente = fabrica.paciente()
    modelo.respuestas += [_mensaje(None, ("buscar_sedes", {}))] * 5
    assert chatbot.responder(db, paciente, "Hola").texto == chatbot._RESPUESTA_SIN_CIERRE
    modelo.respuestas.append(_mensaje("   "))
    assert chatbot.responder(db, paciente, "Hola otra vez").texto == chatbot._RESPUESTA_SIN_CIERRE


def test_si_la_ia_falla_se_deshace_el_turno(cliente, fabrica, modelo):
    paciente = fabrica.paciente()
    modelo.respuestas.append(AsistenteNoDisponibleError("El asistente no está disponible."))
    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Hola"})
    assert r.status_code == 503
    assert cliente.get("/chat", headers=encabezado(paciente)).json() == []  # puede reenviar el mismo mensaje


def test_muchos_mensajes_seguidos_se_frenan_pero_nunca_una_urgencia(cliente, fabrica, modelo, monkeypatch):
    monkeypatch.setattr(limite_intentos, "MENSAJES_ELI", limite_intentos.LimiteIntentos(maximo=2, ventana_segundos=600))
    paciente, otro = fabrica.paciente(), fabrica.paciente()
    modelo.respuestas += [_mensaje("Con gusto."), _mensaje("Con gusto."), _mensaje("Con gusto.")]
    for _ in range(2):
        assert cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Hola"}).status_code == 200
    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Hola"})
    assert r.status_code == 429 and "muchos mensajes seguidos" in r.json()["detail"]
    # Una urgencia se responde igual, y el límite es de cada paciente.
    urgencia = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Me duele mucho el pecho y no puedo respirar"})
    assert urgencia.status_code == 200 and urgencia.json()["tipo"] == "urgencia"
    assert cliente.post("/chat", headers=encabezado(otro), json={"mensaje": "Hola"}).status_code == 200


def test_conversacion_ocupada(cliente, fabrica):
    paciente = fabrica.paciente()
    conversacion = chatbot._obtener(paciente.id)
    conversacion.ocupada.acquire()
    try:
        r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "Hola"})
        assert r.status_code == 409
        # Una urgencia se responde aunque la conversación esté ocupada.
        r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "me desmayé"})
        assert r.json()["tipo"] == "urgencia"
    finally:
        conversacion.ocupada.release()
        chatbot.reiniciar(paciente.id)


def test_el_historial_se_recorta_desde_un_mensaje_del_paciente():
    conversacion = chatbot._Conversacion()
    for i in range(30):
        conversacion.mensajes += [{"role": "user", "content": f"p{i}"}, {"role": "assistant", "content": f"r{i}"}]
    chatbot._recortar(conversacion)
    assert len(conversacion.mensajes) <= chatbot._MAX_MENSAJES
    assert conversacion.mensajes[0]["role"] == "user"


# --- Cliente del proveedor (ia.py): respaldo entre modelos ---

def _respuesta_http(codigo):
    return httpx.Response(codigo, request=httpx.Request("POST", "https://ia.test/v1/chat/completions"))


@pytest.fixture
def proveedor(monkeypatch):
    monkeypatch.setattr(settings, "ia_modelo", "principal")
    monkeypatch.setattr(settings, "ia_modelos_respaldo", "respaldo-1, respaldo-2")
    ia._pausados.clear()
    llamadas, respuestas, tiempos = [], [], []

    def crear(model, timeout=None, **_):
        llamadas.append(model)
        tiempos.append(timeout)
        respuesta = respuestas.pop(0)
        if isinstance(respuesta, Exception):
            raise respuesta
        return SimpleNamespace(choices=[SimpleNamespace(message=respuesta)])

    cliente_falso = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=crear)))
    monkeypatch.setattr(ia, "_cliente", lambda: cliente_falso)
    yield SimpleNamespace(llamadas=llamadas, respuestas=respuestas, tiempos=tiempos)
    ia._pausados.clear()


def test_usa_el_modelo_de_respaldo_si_el_principal_falla(proveedor):
    proveedor.respuestas += [
        openai.RateLimitError("sin cupo", response=_respuesta_http(429), body=None),
        openai.InternalServerError("alta demanda", response=_respuesta_http(503), body=None),
        _mensaje("Hola"),
    ]
    assert ia.completar([{"role": "user", "content": "Hola"}]).content == "Hola"
    assert proveedor.llamadas == ["principal", "respaldo-1", "respaldo-2"]

    proveedor.respuestas.append(_mensaje("Otra vez"))
    ia.completar([{"role": "user", "content": "Hola"}], usar_tools=False)
    assert proveedor.llamadas[-1] == "respaldo-1"  # el principal quedó en pausa tras el 429


def test_errores_del_proveedor(proveedor):
    proveedor.respuestas += [openai.RateLimitError("sin cupo", response=_respuesta_http(429), body=None)] * 3
    with pytest.raises(AsistenteNoDisponibleError, match="muchas solicitudes"):
        ia.completar([])

    ia._pausados.clear()
    proveedor.respuestas += [openai.APIConnectionError(request=httpx.Request("POST", "https://ia.test"))] * 3
    with pytest.raises(AsistenteNoDisponibleError, match="no está disponible"):
        ia.completar([])

    proveedor.respuestas.append(openai.AuthenticationError("llave inválida", response=_respuesta_http(401), body=None))
    with pytest.raises(AsistenteNoDisponibleError):
        ia.completar([])
    assert proveedor.llamadas[-1] == "principal"  # una llave inválida no se arregla cambiando de modelo


def test_eli_responde_en_menos_de_10_segundos(proveedor):
    """RNF-18: cada intento usa solo el tiempo que queda del plazo; si ya no alcanza, se le avisa al paciente."""
    ahora = datetime.now(timezone.utc)
    proveedor.respuestas.append(openai.APITimeoutError(request=httpx.Request("POST", "https://ia.test")))
    proveedor.respuestas.append(_mensaje("Hola"))
    assert ia.completar([], hasta=ahora + timedelta(seconds=5)).content == "Hola"
    assert all(t <= 5 for t in proveedor.tiempos)  # nunca más de lo que queda
    with pytest.raises(AsistenteNoDisponibleError, match="tardando más de lo normal"):
        ia.completar([], hasta=ahora + timedelta(seconds=1))  # ya no alcanza ni un intento
    proveedor.respuestas += [openai.APITimeoutError(request=httpx.Request("POST", "https://ia.test"))] * 3
    with pytest.raises(AsistenteNoDisponibleError, match="tardando más de lo normal"):
        ia.completar([], hasta=datetime.now(timezone.utc) + timedelta(seconds=9))


def test_un_solo_plazo_para_todo_el_mensaje(cliente, fabrica, modelo):
    """RNF-18: el chat comparte un solo plazo de 9 s entre todos los pasos de un mismo mensaje."""
    modelo.respuestas += [_mensaje(None, ("buscar_especialidades", {})), _mensaje("Listo.")]
    cliente.post("/chat", headers=encabezado(fabrica.paciente()), json={"mensaje": "¿Qué especialidades hay?"})
    primero, segundo = modelo.plazos
    assert primero == segundo
    assert timedelta(0) < primero - datetime.now(timezone.utc) <= timedelta(seconds=9)


def test_sin_llave_el_asistente_no_esta_disponible(monkeypatch):
    ia._cliente.cache_clear()
    monkeypatch.setattr(settings, "ia_api_key", "")
    with pytest.raises(AsistenteNoDisponibleError, match="Eli no está disponible"):
        ia._cliente()
    monkeypatch.setattr(settings, "ia_api_key", "llave-de-prueba")
    assert ia._cliente().api_key == "llave-de-prueba"
    ia._cliente.cache_clear()
