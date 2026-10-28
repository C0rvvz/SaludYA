# Imagen de PRODUCCIÓN: la página y la API en un solo servicio (ver
# backend/app/servidor.py). Es la que usa Render (render.yaml); se puede
# probar en este equipo, ver README, sección "Publicar en internet".
# Para desarrollar se sigue usando docker-compose.yml (backend/Dockerfile).

# --- 1. Compilar el frontend ---
FROM node:22-alpine AS pagina
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# La página le habla a la API en su misma dirección (/api), como en desarrollo.
ENV VITE_API_URL=/api
RUN npm run build

# --- 2. La API, que además sirve la página compilada ---
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini .
COPY --from=pagina /frontend/dist ./web

# Sin permisos de administrador dentro del contenedor.
RUN useradd --create-home --uid 10001 saludya
USER saludya

EXPOSE 8000

# Migraciones y luego el servidor, en un solo proceso: el límite de
# intentos y el historial del chat viven en memoria (ver limite_intentos.py).
# Render indica el puerto en PORT.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.servidor:app --host 0.0.0.0 --port ${PORT:-8000} --no-server-header"]
