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

engine = create_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependencia de FastAPI: entrega una sesión y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
