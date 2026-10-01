"""
Asistente conversacional — HU-33. Sin proveedor de IA real: las
respuestas del modelo se simulan, y las funciones (tools) se prueban
directamente contra la base de pruebas.
"""

import json
from datetime import timedelta
from types import SimpleNamespace

import httpx
import openai
import pytest
from openai.types.chat import ChatCompletionMessage

from app.core.config import settings
from app.models import Sede
from app.models.cita import EstadoCita
from app.services import chatbot, herramientas_ia, ia
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
    assert {"nombre", "ciudad"} <= set(_llamar(db, paciente, estado, "buscar_sedes")["sedes"][0])


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
    respuestas, enviados = [], []

    def completar(mensajes, usar_tools=True):
        enviados.append(mensajes)
        respuesta = respuestas.pop(0)
        if isinstance(respuesta, Exception):
            raise respuesta
        return respuesta

    monkeypatch.setattr(ia, "completar", completar)
    return SimpleNamespace(respuestas=respuestas, enviados=enviados)


def test_conversacion_con_funciones(cliente, fabrica, modelo):
    paciente = fabrica.paciente()
    modelo.respuestas += [_mensaje(None, ("buscar_especialidades", {})), _mensaje("Tenemos estas especialidades.")]

    r = cliente.post("/chat", headers=encabezado(paciente), json={"mensaje": "¿Qué especialidades hay?"})
    assert r.json() == {"respuesta": "Tenemos estas especialidades.", "tipo": "mensaje", "cita": None}
    resultado_tool = modelo.enviados[1][-1]
    assert resultado_tool["role"] == "tool"
    assert "especialidades" in resultado_tool["content"]
    assert paciente.nombre in modelo.enviados[0][0]["content"]  # mensaje de sistema con su nombre

    historial = cliente.get("/chat", headers=encabezado(paciente)).json()
    assert [m["rol"] for m in historial] == ["paciente", "asistente"]
    assert cliente.delete("/chat", headers=encabezado(paciente)).status_code == 204
    assert cliente.get("/chat", headers=encabezado(paciente)).json() == []


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
    llamadas, respuestas = [], []

    def crear(model, **_):
        llamadas.append(model)
        respuesta = respuestas.pop(0)
        if isinstance(respuesta, Exception):
            raise respuesta
        return SimpleNamespace(choices=[SimpleNamespace(message=respuesta)])

    cliente_falso = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=crear)))
    monkeypatch.setattr(ia, "_cliente", lambda: cliente_falso)
    yield SimpleNamespace(llamadas=llamadas, respuestas=respuestas)
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


def test_sin_llave_el_asistente_no_esta_disponible(monkeypatch):
    ia._cliente.cache_clear()
    monkeypatch.setattr(settings, "ia_api_key", "")
    with pytest.raises(AsistenteNoDisponibleError, match="IA_API_KEY"):
        ia._cliente()
    monkeypatch.setattr(settings, "ia_api_key", "llave-de-prueba")
    assert ia._cliente().api_key == "llave-de-prueba"
    ia._cliente.cache_clear()
