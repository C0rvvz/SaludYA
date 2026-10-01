#!/usr/bin/env bash
# Corre todas las pruebas con cobertura y envía el análisis a SonarQube.
#
# Requisitos: la API levantada (docker compose up -d), SonarQube en
# http://localhost:9000 (ver README, sección "Calidad del código") y un
# token de análisis en la variable SONAR_TOKEN.
#
# Uso (desde la raíz del proyecto, en Git Bash):
#   SONAR_TOKEN=<su token> scripts/analisis-sonar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SONAR_TOKEN:?Defina SONAR_TOKEN con un token de SonarQube (Mi cuenta > Seguridad).}"
SONAR_HOST="${SONAR_HOST:-http://host.docker.internal:9000}"
export MSYS_NO_PATHCONV=1 # Git Bash en Windows: no convertir las rutas de los contenedores

echo "== Backend: pruebas con cobertura =="
docker compose exec -T api pytest -q -p no:cacheprovider --cov=app --cov-report=xml:/tmp/coverage.xml
docker compose cp api:/tmp/coverage.xml backend/coverage.xml
# Las rutas del reporte son las del contenedor de la API (/app/app); el
# analizador ve el proyecto en /usr/src.
sed -i 's#<source>/app/app</source>#<source>/usr/src/backend/app</source>#' backend/coverage.xml

echo "== Frontend: pruebas con cobertura =="
(cd frontend && npx vitest run --coverage --coverage.reporter=lcov --coverage.reporter=text-summary)
# En Windows, Vitest escribe "src\App.jsx": se pasa a rutas del proyecto.
sed -i -e 's#\\#/#g' -e 's#^SF:src/#SF:frontend/src/#' frontend/coverage/lcov.info

echo "== Análisis en SonarQube =="
docker run --rm \
  -e SONAR_HOST_URL="$SONAR_HOST" \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$(pwd -W 2>/dev/null || pwd):/usr/src" \
  sonarsource/sonar-scanner-cli

echo "Listo: resultados en http://localhost:9000/dashboard?id=saludya"
