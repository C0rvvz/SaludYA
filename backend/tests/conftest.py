"""
Configuración común de las pruebas.

Las pruebas usan una base de datos APARTE: la misma de DATABASE_URL con
el sufijo "_test". Se crea desde cero y se migra con Alembic al empezar,
así que también comprueba que las migraciones corren completas. Cada
prueba trabaja dentro de una transacción que se deshace al terminar:
ninguna deja datos para la siguiente y la base de desarrollo nunca se
toca.

Se corren dentro del contenedor de la API:
    docker compose exec api pytest
"""

import itertools
import os
import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

# --- Antes de importar la app: base de pruebas, sin tareas en segundo plano ni servicios externos ---
if "DATABASE_URL" not in os.environ:
    pytest.exit("Falta DATABASE_URL. Corra las pruebas en el contenedor: docker compose exec api pytest")
_URL_DESARROLLO = make_url(os.environ["DATABASE_URL"])
_URL_PRUEBAS = _URL_DESARROLLO.set(database=f"{_URL_DESARROLLO.database}_test")
os.environ["DATABASE_URL"] = _URL_PRUEBAS.render_as_string(hide_password=False)
os.environ["TAREAS_PERIODICAS_ACTIVAS"] = "false"
os.environ["WHATSAPP_MODE"] = "mock"
os.environ["IA_API_KEY"] = ""

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.database import engine, get_db  # noqa: E402
from app.core.security import TIPO_PERSONAL, crear_access_token, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Cita, Disponibilidad, Eps, Especialista, Paciente, Personal  # noqa: E402
from app.models.cita import CanalContacto, EstadoCita  # noqa: E402
from app.models.disponibilidad import EstadoDisponibilidad  # noqa: E402
from app.models.especialista import Modalidad  # noqa: E402
from app.models.paciente import EstadoAfiliacion, TipoDocumento  # noqa: E402
from app.models.personal import RolPersonal  # noqa: E402
from app.utils.tiempo import hoy_en_colombia  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]

# Identificador del candado de PostgreSQL que reserva la base de pruebas.
_CANDADO_PRUEBAS = 71_026


@pytest.fixture(scope="session", autouse=True)
def base_de_pruebas():
    """Crea la base de pruebas desde cero y le aplica todas las migraciones."""
    nombre = _URL_PRUEBAS.database
    servidor = create_engine(_URL_DESARROLLO, isolation_level="AUTOCOMMIT")
    conexion = servidor.connect()
    # Una sola corrida a la vez: si se lanzan dos (p. ej. desde dos
    # terminales), la segunda espera aquí a que termine la primera en vez
    # de borrarle la base o chocar al crearla.
    conexion.execute(text("SELECT pg_advisory_lock(:id)"), {"id": _CANDADO_PRUEBAS})
    try:
        conexion.execute(text(f'DROP DATABASE IF EXISTS "{nombre}" WITH (FORCE)'))
        conexion.execute(text(f'CREATE DATABASE "{nombre}"'))

        # Sin alembic.ini a propósito: su configuración de logging apagaría
        # los loggers de la app que ya existen (y las pruebas que los revisan).
        config = Config()
        config.set_main_option("script_location", str(BACKEND / "alembic"))
        command.upgrade(config, "head")
        yield
    finally:
        engine.dispose()
        conexion.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": _CANDADO_PRUEBAS})
        conexion.close()
        servidor.dispose()


@pytest.fixture
def db():
    """Sesión dentro de una transacción que se deshace al terminar la prueba."""
    conexion = engine.connect()
    transaccion = conexion.begin()
    # Los commit y rollback de los servicios actúan sobre un SAVEPOINT,
    # nunca sobre la transacción de afuera.
    sesion = Session(bind=conexion, join_transaction_mode="create_savepoint", autoflush=False)
    try:
        yield sesion
    finally:
        sesion.close()
        transaccion.rollback()
        conexion.close()


@pytest.fixture
def cliente(db):
    """Cliente HTTP de la API que usa la misma sesión de la prueba."""
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def encabezado(sujeto) -> dict:
    """Authorization con un JWT válido para un paciente o para el personal."""
    if isinstance(sujeto, Personal):
        token, _ = crear_access_token(sujeto.id, rol=sujeto.rol.value, tipo=TIPO_PERSONAL)
    else:
        token, _ = crear_access_token(sujeto.id)
    return {"Authorization": f"Bearer {token}"}


class Fabrica:
    """Crea los datos que necesita cada prueba, con valores por defecto razonables."""

    def __init__(self, db: Session):
        self.db = db
        self._franjas = itertools.count()
        # El catálogo de ejemplo (EPS, especialidades, sedes, especialistas) lo siembran las migraciones.
        self.especialista = db.query(Especialista).order_by(Especialista.nombre).first()
        self.eps = db.query(Eps).order_by(Eps.nombre).first()
        self.especialidad_id = self.especialista.especialidad_id
        self.sede_id = self.especialista.sedes[0].id
        # Uno de otra especialidad, para probar que no se mezclan.
        self.otro_especialista = (
            db.query(Especialista).filter(Especialista.especialidad_id != self.especialidad_id).first()
        )

    def paciente(self, **datos) -> Paciente:
        valores = {
            "tipo_documento": TipoDocumento.CEDULA_CIUDADANIA,
            "numero_documento": str(uuid.uuid4().int)[:10],
            "nombre": "Paciente de Prueba",
            "telefono_whatsapp": "3001234567",
            "acepto_tratamiento_datos": True,
            "estado_afiliacion": EstadoAfiliacion.ACTIVA,
            "eps_id": self.eps.id,
        }
        return self._guardar(Paciente(**(valores | datos)))

    def franja(self, fecha: date | None = None, hora: time | None = None, **datos) -> Disponibilidad:
        """Horario disponible; por defecto, dentro de 10 días y a una hora distinta cada vez."""
        if hora is None:
            minutos = next(self._franjas)
            hora = time(6 + minutos // 60, minutos % 60)
        valores = {
            "especialista_id": self.especialista.id,
            "sede_id": self.especialista.sedes[0].id,
            "modalidad": Modalidad.PRESENCIAL,
            "fecha": fecha or hoy_en_colombia() + timedelta(days=10),
            "hora": hora,
            "estado": EstadoDisponibilidad.DISPONIBLE,
        }
        return self._guardar(Disponibilidad(**(valores | datos)))

    def cita(self, paciente: Paciente, estado: EstadoCita = EstadoCita.CONFIRMADA, **datos_franja) -> Cita:
        """Por defecto, las ya cerradas (atendida / no asistió) son de hoy temprano, y las demás, futuras."""
        if estado in (EstadoCita.ATENDIDA, EstadoCita.NO_ASISTIO):
            datos_franja = {"fecha": hoy_en_colombia()} | datos_franja
        franja = self.franja(estado=EstadoDisponibilidad.RESERVADO, **datos_franja)
        return self._guardar(Cita(
            paciente_id=paciente.id,
            disponibilidad_id=franja.id,
            canal_recordatorio=CanalContacto.WHATSAPP,
            estado=estado,
            numero_comprobante=f"SY-{uuid.uuid4().hex[:8].upper()}",
            cerrada_en=datetime.now(timezone.utc) if estado in (EstadoCita.ATENDIDA, EstadoCita.NO_ASISTIO) else None,
        ))

    def personal(self, rol: RolPersonal = RolPersonal.ADMINISTRADOR) -> Personal:
        return self._guardar(Personal(
            nombre=f"Personal {rol.value}",
            correo=f"{uuid.uuid4().hex[:10]}@saludya.test",
            password_hash=hash_password("clave-de-prueba-123"),
            rol=rol,
            activo=True,
        ))

    def _guardar(self, objeto):
        # commit (no solo flush): si un servicio hace rollback durante la
        # prueba, deshace su propio SAVEPOINT y no los datos ya creados.
        self.db.add(objeto)
        self.db.commit()
        return objeto


@pytest.fixture
def fabrica(db) -> Fabrica:
    return Fabrica(db)
