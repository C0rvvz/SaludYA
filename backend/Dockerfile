FROM python:3.12-slim

WORKDIR /app

# Dependencias del sistema necesarias para compilar psycopg2 si hiciera falta
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./app ./app
COPY ./alembic ./alembic
COPY ./alembic.ini .

EXPOSE 8000

# Aplica las migraciones pendientes antes de arrancar la API: así la base
# queda al día en cualquier PC sin correr "alembic upgrade head" a mano.
# Si una migración falla, la API no arranca (mejor que correr con la base
# desactualizada).
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
