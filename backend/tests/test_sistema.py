"""
Catálogo médico (HU-09 a HU-15), estado de la API, seguridad, tareas en
segundo plano, generación de horarios y scripts de administración.
"""

import asyncio
import random
import uuid
from datetime import datetime, time, timedelta, timezone
from time import monotonic

import jwt
import pytest

from app.core import database, security
from app.core.config import settings
from app.main import app, lifespan
from app.models import Especialista, Personal
from app.models.disponibilidad import Disponibilidad, EstadoDisponibilidad
from app.routers import catalogo
from app.scripts import crear_personal, generar_disponibilidad
from app.services import disponibilidad_service, ips_simulada_service, tareas_periodicas
from app.utils.tiempo import hoy_en_colombia
from tests.conftest import encabezado


# --- Catálogo ---

def test_catalogo_publico(cliente, fabrica):
    especialidades = cliente.get("/especialidades").json()
    assert fabrica.especialista.especialidad.nombre in [e["nombre"] for e in especialidades]
    assert len(cliente.get("/sedes").json()) >= 1
    assert len(cliente.get("/eps").json()) >= 1

    filtrados = cliente.get(f"/especialistas?especialidad_id={fabrica.especialidad_id}").json()
    assert filtrados
    assert all(e["especialidad"]["id"] == str(fabrica.especialidad_id) for e in filtrados)
    assert filtrados[0]["modalidades"]


def test_disponibilidad_de_un_especialista_y_busqueda_combinada(cliente, fabrica):
    franja = fabrica.franja(fecha=hoy_en_colombia() + timedelta(days=15))
    ruta = f"/especialistas/{fabrica.especialista.id}/disponibilidad"

    ids = [f["id"] for f in cliente.get(f"{ruta}?sede_id={fabrica.sede_id}&modalidad=presencial").json()]
    assert str(franja.id) in ids
    assert cliente.get(f"/especialistas/{fabrica.sede_id}/disponibilidad").status_code == 404

    consulta = (
        f"/disponibilidad/buscar?especialidad_id={fabrica.especialidad_id}&sede_id={fabrica.sede_id}"
        f"&modalidad=presencial&fecha={franja.fecha}&hora={franja.hora}"
    )
    assert [f["id"] for f in cliente.get(consulta).json()] == [str(franja.id)]  # HU-11: todos los filtros
    ciudad = cliente.get(f"/disponibilidad/buscar?ciudad=NoExiste&fecha={franja.fecha}").json()
    assert ciudad == []


def test_las_busquedas_responden_en_menos_de_2_segundos(cliente, db):
    """RNF-20, con mucha más agenda que la real: 60 días hábiles de todos los especialistas."""
    for semilla in range(3):  # la red crece con especialistas que llegan por la IPS
        ips_simulada_service.sincronizar(db, None, random.Random(semilla))
    disponibilidad_service.generar_franjas(db, dias=60)
    assert db.query(Disponibilidad).count() > 4000

    especialidad = db.query(Especialista).first().especialidad_id
    for consulta in ("/disponibilidad/buscar", f"/disponibilidad/buscar?especialidad_id={especialidad}"):
        empezo = monotonic()
        r = cliente.get(consulta)
        assert r.status_code == 200 and r.json()
        assert monotonic() - empezo < 2, consulta


def test_la_cache_del_catalogo_reutiliza_la_respuesta_unos_segundos(cliente, fabrica, monkeypatch):
    """RNF-21: con cientos de pacientes a la vez, la misma búsqueda sale de memoria por unos segundos."""
    monkeypatch.setattr(settings, "cache_catalogo_segundos", 60)
    catalogo.vaciar_cache()
    consulta = f"/disponibilidad/buscar?especialidad_id={fabrica.especialidad_id}&fecha={hoy_en_colombia() + timedelta(days=20)}"
    assert cliente.get(consulta).json() == []
    fabrica.franja(fecha=hoy_en_colombia() + timedelta(days=20))
    assert cliente.get(consulta).json() == []  # todavía la guardada
    catalogo.vaciar_cache()
    assert len(cliente.get(consulta).json()) == 1  # vencida la caché, se ve el horario nuevo
    catalogo.vaciar_cache()


# --- Estado de la API ---

def test_estado_de_la_api(cliente, monkeypatch):
    assert cliente.get("/").json()["message"] == "SaludYA API está funcionando"
    assert cliente.get("/health").json() == {"status": "ok", "service": "SaludYA API", "database": "ok"}

    class SinBase:
        def connect(self):
            raise RuntimeError("sin conexión")

    from app.routers import health
    monkeypatch.setattr(health, "engine", SinBase())
    assert cliente.get("/health").json()["database"].startswith("error")


def test_get_db_entrega_y_cierra_la_sesion():
    async def usar():
        generador = database.get_db()
        sesion = await generador.__anext__()
        assert sesion.is_active
        await generador.aclose()

    asyncio.run(usar())


def test_el_arranque_lanza_las_tareas_solo_si_estan_activas(monkeypatch):
    lanzadas = []

    async def tarea_falsa():
        lanzadas.append(True)
        await asyncio.sleep(3600)

    async def arrancar_y_parar():
        async with lifespan(app):
            await asyncio.sleep(0)

    monkeypatch.setattr(tareas_periodicas, "ejecutar_periodicamente", tarea_falsa)
    monkeypatch.setattr(settings, "tareas_periodicas_activas", True)
    asyncio.run(arrancar_y_parar())
    monkeypatch.setattr(settings, "tareas_periodicas_activas", False)
    asyncio.run(arrancar_y_parar())
    assert lanzadas == [True]


# --- Seguridad ---

def test_contrasenas_y_tokens():
    guardado = security.hash_password("una-clave-segura")
    assert security.verificar_password("una-clave-segura", guardado)
    assert not security.verificar_password("otra", guardado)
    assert not security.verificar_password("x", "bcrypt$1$2$3$a$b")
    assert not security.verificar_password("x", "formato-roto")

    cita_id = uuid.uuid4()
    token = security.crear_token_confirmacion_asistencia(cita_id, datetime.now(timezone.utc) + timedelta(hours=1))
    assert security.leer_token_confirmacion_asistencia(token) == cita_id
    with pytest.raises(jwt.InvalidTokenError):
        security.decodificar_access_token(token)  # el enlace no sirve como sesión

    sin_cita = jwt.encode(
        {"sub": "no-es-uuid", "aud": security.AUDIENCIA_CONFIRMAR_ASISTENCIA}, settings.jwt_secret, algorithm="HS256"
    )
    with pytest.raises(jwt.InvalidTokenError):
        security.leer_token_confirmacion_asistencia(sin_cita)


def test_sesion_vencida_y_token_del_tipo_equivocado(cliente, fabrica):
    paciente = fabrica.paciente()
    ahora = datetime.now(timezone.utc)
    vencido = jwt.encode(
        {"iss": security.EMISOR, "sub": str(paciente.id), "sid": str(uuid.uuid4()), "tipo": "paciente",
         "iat": ahora - timedelta(hours=2), "exp": ahora - timedelta(minutes=1)},
        settings.jwt_secret, algorithm="HS256",
    )
    r = cliente.get("/citas", headers={"Authorization": f"Bearer {vencido}"})
    assert r.status_code == 401
    assert "expiró" in r.json()["detail"]

    sin_sujeto = jwt.encode({"sub": "x", "tipo": "paciente"}, settings.jwt_secret, algorithm="HS256")
    assert cliente.get("/citas", headers={"Authorization": f"Bearer {sin_sujeto}"}).status_code == 401
    assert cliente.get("/citas", headers=encabezado(fabrica.personal())).status_code == 401
    borrado = jwt.encode({"sub": str(uuid.uuid4()), "tipo": "paciente"}, settings.jwt_secret, algorithm="HS256")
    assert cliente.get("/citas", headers={"Authorization": f"Bearer {borrado}"}).status_code == 401


# --- Generación de horarios ---

def test_la_agenda_sale_del_horario_de_cada_especialista(db):
    tanda = disponibilidad_service.generar_franjas(db)
    assert tanda.creadas > 0
    assert tanda.desde == hoy_en_colombia() + timedelta(days=1)
    assert tanda.hasta.weekday() < 5  # termina en el décimo día hábil

    futuras = db.query(Disponibilidad).filter(Disponibilidad.fecha >= tanda.desde).all()
    # Nadie queda a la misma hora en dos sedes o modalidades.
    horas = [(f.especialista_id, f.fecha, f.hora) for f in futuras]
    assert len(horas) == len(set(horas))
    # Las horas salen de los turnos: el Dr. Carlos Ramírez atiende los lunes de 7:00 a 12:00, citas de 30 min.
    carlos = db.query(Especialista).filter_by(nombre="Dr. Carlos Ramírez").one()
    lunes = next(f.fecha for f in futuras if f.fecha.weekday() == 0)
    del_lunes = sorted(f.hora for f in futuras if f.especialista_id == carlos.id and f.fecha == lunes)
    assert del_lunes == [time(7, 0), time(7, 30)] + [time(h, m) for h in range(8, 12) for m in (0, 30)]
    # Una parte ya aparece ocupada por otros pacientes de la IPS (HU-10, criterio 3), la mayoría libre.
    ocupadas = sum(1 for f in futuras if f.estado == EstadoDisponibilidad.RESERVADO)
    assert 0 < ocupadas < len(futuras) / 2

    otra = disponibilidad_service.generar_franjas(db)
    assert otra.creadas == 0  # no se duplican


# --- Tareas en segundo plano: usan su propia sesión; aquí, la de la prueba ---

@pytest.fixture
def sesion_de_la_prueba(db, monkeypatch):
    """Las tareas y los scripts abren su propia sesión: se les entrega la de la prueba (sin cerrarla)."""
    class SinCerrar:
        def __init__(self):
            self._db = db

        def __getattr__(self, nombre):
            return getattr(self._db, nombre)

        def close(self):
            pass

    for modulo in (tareas_periodicas, crear_personal, generar_disponibilidad):
        monkeypatch.setattr(modulo, "SessionLocal", SinCerrar)


def test_cada_tarea_corre_su_servicio(sesion_de_la_prueba, fabrica, monkeypatch):
    llamadas = []
    servicios = {
        (tareas_periodicas.recordatorios_service, "enviar_recordatorios_pendientes"): 1,
        (tareas_periodicas.centro_recordatorios_service, "enviar_programados_vencidos"): 1,
        (tareas_periodicas.citas_service, "cerrar_citas_pasadas"): (1, 1),
        (tareas_periodicas.ips_simulada_service, "sincronizar_si_corresponde"): None,
        (tareas_periodicas.disponibilidad_service, "generar_franjas"):
            disponibilidad_service.Tanda(3, 0, hoy_en_colombia(), hoy_en_colombia()),
        (tareas_periodicas.lista_espera_service, "vencer_ofertas"): 1,
        (tareas_periodicas.lista_espera_service, "asignar_cupos"): 1,
    }
    for (modulo, nombre), resultado in servicios.items():
        monkeypatch.setattr(modulo, nombre, lambda db, n=nombre, r=resultado: llamadas.append(n) or r)

    for tarea in (
        tareas_periodicas._recordatorios, tareas_periodicas._programados, tareas_periodicas._cierre_de_citas,
        tareas_periodicas._reposicion_de_disponibilidad, tareas_periodicas._lista_espera,
    ):
        tarea()
    assert sorted(llamadas) == sorted(nombre for _, nombre in servicios)


def test_el_ciclo_sigue_aunque_una_tarea_falle(monkeypatch, caplog):
    corridas = []

    def falla():
        raise RuntimeError("se cayó")

    for nombre in ("_recordatorios", "_programados", "_cierre_de_citas", "_reposicion_de_disponibilidad"):
        monkeypatch.setattr(tareas_periodicas, nombre, lambda n=nombre: corridas.append(n))
    monkeypatch.setattr(tareas_periodicas, "_lista_espera", falla)

    async def detener(_segundos):
        raise asyncio.CancelledError

    monkeypatch.setattr(tareas_periodicas.asyncio, "sleep", detener)
    ciclo = tareas_periodicas.ejecutar_periodicamente()
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(ciclo)
    assert len(corridas) == 4
    assert "Falló la tarea" in caplog.text
    assert "se cayó" in caplog.text


# --- Scripts de administración ---

def test_script_crear_personal(sesion_de_la_prueba, db, monkeypatch, capsys):
    monkeypatch.setenv("SALUDYA_PASSWORD_NUEVA", "clave-del-script-123")
    monkeypatch.setattr("sys.argv", ["crear_personal", "--nombre", "Ana Script", "--correo", "ana@saludya.co"])
    assert crear_personal.main() == 0
    assert "Cuenta creada: Ana Script" in capsys.readouterr().out
    assert db.query(Personal).filter_by(correo="ana@saludya.co").one().rol.value == "administrador"

    assert crear_personal.main() == 1  # el correo ya existe
    assert "No se pudo crear la cuenta" in capsys.readouterr().err


def test_script_crear_personal_pide_la_contrasena_dos_veces(sesion_de_la_prueba, monkeypatch, capsys):
    monkeypatch.delenv("SALUDYA_PASSWORD_NUEVA", raising=False)
    monkeypatch.setattr("sys.argv", ["crear_personal", "--nombre", "Beto", "--correo", "beto@saludya.co"])
    respuestas = iter(["clave-uno-123456", "clave-dos-123456"])
    monkeypatch.setattr(crear_personal.getpass, "getpass", lambda _texto: next(respuestas))
    assert crear_personal.main() == 1
    assert "no coinciden" in capsys.readouterr().err


def test_script_generar_disponibilidad(sesion_de_la_prueba, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["generar_disponibilidad", "--dias", "1"])
    assert generar_disponibilidad.main() == 0
    assert "Franjas creadas" in capsys.readouterr().out
    monkeypatch.setattr("sys.argv", ["generar_disponibilidad", "--dias", "0"])
    assert generar_disponibilidad.main() == 1
