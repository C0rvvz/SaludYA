"""
Configuración de la conexión a PostgreSQL mediante SQLAlchemy.

Esta Parte 1 NO define ningún modelo todavía (eso es la Parte 2).
Aquí solo dejamos preparado:
- el engine de conexión;
- la fábrica de sesiones (SessionLocal);
- la clase base (Base) de la que heredarán los modelos futuros;
- la función get_db(), que los routers usarán como dependencia de
  FastAPI para obtener una sesión de base de datos por request.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

# RNF-21 (500 usuarios a la vez): FastAPI atiende las rutas en hasta 40 hilos.
# Con menos conexiones que hilos, bajo carga unas peticiones esperan una
# conexión mientras otras esperan un hilo para devolverla, y se traban
# (lo mostró app/scripts/prueba_carga.py). Por eso el pool cubre los 40.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


async def get_db():
    """
    Dependencia de FastAPI: entrega una sesión y la cierra al terminar.

    Es async a propósito (RNF-21): así abrirla y cerrarla no espera un hilo
    libre. Si fuera síncrona, con cientos de peticiones en cola, una que ya
    terminó tendría que esperar turno para devolver su conexión, mientras
    las de adelante esperan una conexión libre: se trababan todas. La ruta
    sigue corriendo en un hilo; cerrar la sesión es inmediato.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
