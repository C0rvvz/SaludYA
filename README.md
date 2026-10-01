# SaludYA

Trabajo universitario: plataforma web para agendar y gestionar citas médicas. El paciente agenda, confirma, reprograma o cancela sus citas y recibe recordatorios por WhatsApp. El personal administrativo gestiona las citas, la lista de espera, los recordatorios y las solicitudes, y consulta reportes y la auditoría.

## Funcionalidades

**Paciente**
- Registro e ingreso con cédula y código de verificación por WhatsApp (HU-01 a HU-08).
- Buscar disponibilidad por especialidad, especialista, sede, modalidad y fecha, y agendar con comprobante (HU-09 a HU-17).
- "Mis citas": estado, próximas, historial, confirmar asistencia, reprogramar, cancelar y registrar la llegada (HU-18 a HU-30).
- Lista de espera con ofertas de cupos liberados (HU-19, HU-31, HU-32).
- Solicitudes de cita (cartas de petición).
- Asistente conversacional con IA que detecta urgencias (HU-33).
- Calificar la atención de una cita atendida (HU-71).

**Personal administrativo** (`/admin`)
- Gestión de citas, contacto, observaciones y resultado de la atención (HU-34 a HU-43).
- Dashboard y reportes por periodo (HU-44 a HU-52, HU-68 a HU-75).
- Lista de espera (HU-45, HU-53 a HU-61) y centro de recordatorios (HU-62 a HU-67).
- Solicitudes y revisión clínica (HU-76 a HU-79).
- Auditoría de todas las acciones sobre las citas (HU-80 a HU-85).
- Usuarios del personal con roles: administrador, agendamiento, call center y coordinador médico.

## Tecnologías

| Parte | Tecnología |
| --- | --- |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Base de datos | PostgreSQL 16 |
| Frontend | React 19, React Router, Vite |
| Infraestructura | Docker Compose |
| Integraciones | WhatsApp Cloud API (Meta), cualquier IA compatible con la API de OpenAI (por defecto Gemini) |

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js](https://nodejs.org/) 22 o superior
- Git

## Puesta en marcha

1. **Variables de entorno.** En la raíz del proyecto, copie la plantilla y cambie al menos `POSTGRES_PASSWORD` y `JWT_SECRET`:

   ```bash
   cp .env.example .env
   ```

   Para generar un `JWT_SECRET`:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

2. **Base de datos y API.** Las migraciones se aplican solas al arrancar la API.

   ```bash
   docker compose up -d --build
   ```

   - API: http://localhost:8000
   - Documentación interactiva de la API: http://localhost:8000/docs

3. **Primer administrador.** Pide la contraseña sin mostrarla. Los demás usuarios se crean desde la pantalla "Usuarios".

   ```bash
   docker compose exec api python -m app.scripts.crear_personal --nombre "Ana Pérez" --correo ana@saludya.co --rol administrador
   ```

4. **Frontend.**

   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```

   - Pacientes: http://localhost:5173
   - Personal: http://localhost:5173/admin/ingresar

### Ingresar como paciente sin WhatsApp real (modo demostración)

Mientras `WHATSAPP_MODE=mock` y `APP_ENV=development`, los mensajes no se envían y **la pantalla de ingreso muestra el código de verificación** en un aviso de "Modo demostración". Con WhatsApp real o en otro entorno el código nunca se muestra (HU-02, criterio 4).

Los demás mensajes (comprobante, recordatorios, cancelaciones) quedan en el log de la API, en las líneas `[WHATSAPP MOCK]`:

```bash
docker compose logs -f api
```

### Horarios disponibles

La API genera franjas de disponibilidad futuras sola cuando se acaban. Para generar más días a mano:

```bash
docker compose exec api python -m app.scripts.generar_disponibilidad --dias 10
```

### Después de traer cambios de otro PC

```bash
git pull
docker compose up -d --build api
cd frontend && npm install
```

El `--build` es necesario cuando hay migraciones o dependencias nuevas: la imagen de la API las incluye al construirse.

## Pruebas

**Backend** (`backend/tests`, pytest): corren dentro del contenedor, sobre una base de datos aparte (`<POSTGRES_DB>_test`) que se crea y se migra en cada ejecución. La base de desarrollo no se toca. Las llamadas a la IA y a WhatsApp se simulan.

```bash
docker compose exec api pytest
```

Con el porcentaje de código cubierto por las pruebas:

```bash
docker compose exec api pytest --cov=app --cov-report=term-missing
```

**Frontend** (`frontend/tests`, Vitest + Testing Library): abren la aplicación completa en cada pantalla, con un backend simulado (`tests/backendFalso.jsx`).

```bash
cd frontend
npm test
npm run test:coverage
```

Revisión del frontend:

```bash
cd frontend
npm run lint
npm run build
```

## Calidad del código (SonarQube)

SonarQube analiza el código del backend y del frontend (errores, vulnerabilidades, mantenibilidad, duplicación) junto con la cobertura de las pruebas. Corre en Docker, solo en este equipo.

1. **Levantar SonarQube** (tarda un par de minutos en arrancar):

   ```bash
   docker compose --profile calidad up -d sonarqube
   ```

2. **Primera vez:** entre a http://localhost:9000 con usuario `admin` y contraseña `admin`. Le pedirá cambiar la contraseña. Después, en **Mi cuenta → Seguridad**, genere un token de tipo **Global Analysis Token**.

3. **Analizar** (corre las pruebas del backend y del frontend con cobertura y envía todo a SonarQube). Desde la raíz del proyecto, reemplazando `sqa_xxx` por su token.

   En **PowerShell** (se llama al Bash de Git por su ruta: el `bash` de Windows es el de WSL, que no ve Docker ni npm):

   ```powershell
   $env:SONAR_TOKEN = "sqa_xxx"
   & "C:\Program Files\Git\bin\bash.exe" scripts/analisis-sonar.sh
   ```

   En **Git Bash**:

   ```bash
   SONAR_TOKEN=sqa_xxx scripts/analisis-sonar.sh
   ```

   Los resultados quedan en http://localhost:9000/dashboard?id=saludya.

Para apagarlo: `docker compose --profile calidad stop sonarqube`. La configuración del análisis está en [sonar-project.properties](sonar-project.properties).

## Variables de entorno

Todas están explicadas en [.env.example](.env.example). Las principales:

| Variable | Para qué sirve |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciales de PostgreSQL |
| `JWT_SECRET` | Firma de las sesiones. Debe ser larga y aleatoria |
| `WHATSAPP_MODE` | `mock` (solo log) o `real` (WhatsApp Cloud API) |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Credenciales de Meta para el modo real |
| `IA_API_KEY`, `IA_BASE_URL`, `IA_MODELO` | Asistente conversacional. Sin llave, el chat avisa que no está disponible |
| `TAREAS_PERIODICAS_ACTIVAS` | Recordatorios y cierre automático de citas en segundo plano |
| `CORS_ORIGINS`, `FRONTEND_URL` | Dirección del frontend |

## WhatsApp real (Meta)

> **Antes de empezar:** Meta puede exigir **verificar la empresa** (documentos legales como RUT o Cámara de Comercio) incluso para usar el número de prueba. Si en el Administrador de WhatsApp la cuenta aparece como **"Cuenta restringida"**, no entregará ningún mensaje hasta verificarla. Para este proyecto universitario se usa el modo `mock`, que funciona completo sin Meta.

1. En [developers.facebook.com](https://developers.facebook.com/) cree una app con el caso de uso **"Connect with customers through WhatsApp"** y un portafolio comercial.
2. En **WhatsApp > API Setup**: copie el **Phone number ID** del número de prueba, genere un token con **Generate access token** y, en el campo **To**, agregue y verifique los celulares que van a recibir mensajes (máximo 5 en modo de prueba).
3. En `.env`:

   ```
   WHATSAPP_MODE=real
   WHATSAPP_ACCESS_TOKEN=<token>
   WHATSAPP_PHONE_NUMBER_ID=<phone number id>
   ```

   Después reinicie la API con `docker compose up -d --force-recreate api`.
4. Desde cada celular de prueba, envíe cualquier mensaje al número de prueba de Meta. WhatsApp solo entrega mensajes de texto libre durante las 24 horas siguientes a un mensaje del usuario. Para escribirle a cualquier paciente sin ese paso se necesitan plantillas aprobadas por Meta.

El token generado en **API Setup** dura 24 horas. Para uno permanente, cree un usuario del sistema en la configuración del negocio con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.

Los números se guardan como `3001234567` y se envían con el indicativo de Colombia (`573001234567`).

## Estructura

```
backend/
  app/
    core/           configuración, base de datos, seguridad y permisos por rol
    models/         tablas (SQLAlchemy)
    schemas/        entrada y salida de la API (Pydantic)
    repositories/   consultas a la base de datos
    services/       reglas de negocio
    routers/        endpoints
    integrations/   WhatsApp, EPS simulada, envío por canal
    scripts/        crear personal, generar disponibilidad
  alembic/versions/ migraciones
  tests/            pruebas (pytest)
frontend/
  src/
    api/            llamadas a la API
    pages/          pantallas del paciente y del personal (admin/)
    components/     componentes compartidos
    styles/         estilos y tokens de diseño
  tests/            pruebas (Vitest) y backend simulado
scripts/
  analisis-sonar.sh pruebas con cobertura + análisis en SonarQube
docker-compose.yml
sonar-project.properties
.env.example
```
