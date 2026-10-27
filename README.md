# SaludYA

Trabajo universitario: plataforma web para agendar y gestionar citas médicas. El paciente agenda, confirma, reprograma o cancela sus citas y recibe recordatorios por WhatsApp. El personal administrativo gestiona las citas, la lista de espera, los recordatorios y las solicitudes, y consulta reportes y la auditoría.

## Funcionalidades

**Paciente**
- Registro e ingreso con cédula y código de verificación por WhatsApp (HU-01 a HU-08).
- Buscar disponibilidad por especialidad, especialista, sede, modalidad y fecha, y agendar con comprobante (HU-09 a HU-17).
- Médicos por EPS: cada médico atiende a los afiliados de una EPS (se ve en corto junto a su nombre). El paciente agenda con los de su EPS y los de las EPS aliadas, que comparten médicos (p. ej. Sura y Savia Salud); los de otras EPS se ven en gris. Sin EPS (particular), con cualquiera.
- "Mis citas": estado, próximas, historial, confirmar asistencia, reprogramar, cancelar y registrar la llegada (HU-18 a HU-30).
- Fórmula médica de cada cita atendida: diagnóstico, medicamentos y recomendaciones, para descargar; y las farmacias donde reclamarlos, con el QR del código (gratis en las aliadas) y "Cómo llegar".
- Lista de espera con ofertas de cupos liberados (HU-19, HU-31, HU-32).
- "Solicitar petición": pedir una cita a la medida cuando no hay horarios que sirvan.
- Asistente conversacional con IA que detecta urgencias (HU-33).
- Calificar la atención de una cita atendida (HU-71).

**Personal administrativo** (`/admin`)
- Gestión de citas, contacto, observaciones, resultado de la atención y fórmula médica (HU-34 a HU-43).
- Resumen y reportes por periodo (HU-44 a HU-52, HU-68 a HU-75).
- Especialistas con su horario semanal, sedes de la red y la actualización simulada de la IPS (que también trae las fórmulas de las citas atendidas).
- Lista de espera (HU-45, HU-53 a HU-61) y centro de recordatorios (HU-62 a HU-67).
- Solicitudes y revisión clínica (HU-76 a HU-79).
- Auditoría de todas las acciones sobre las citas (HU-80 a HU-85).
- Seguridad: ingresos fallidos, cuentas bloqueadas, sesiones abiertas y alertas; los datos médicos se guardan cifrados (AES-256).
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

   Y la llave para cifrar los datos médicos (`CLAVE_CIFRADO_DATOS`). Guárdela en un lugar seguro: sin ella no se pueden leer esos datos.

   ```bash
   python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
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

Cada especialista tiene un horario semanal (turnos por día, sede y modalidad) y la API mantiene sola su agenda de los próximos 10 días hábiles. Cada 10 días llega una actualización simulada de la IPS (especialistas nuevos y retiros); el administrador también la puede pedir y agregar especialistas en **Personal › Especialistas**. Para generar más días a mano:

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

### Integración continua (GitHub Actions)

En cada push a `main` y en cada pull request, [.github/workflows/ci.yml](.github/workflows/ci.yml) corre las pruebas del backend contra un PostgreSQL con todas las migraciones, y el lint, las pruebas y el build del frontend (RNF-15).

### Rendimiento

- **Eli (RNF-18):** cada mensaje del paciente tiene un plazo total de 9 s (`IA_PRESUPUESTO_SEGUNDOS`), compartido entre todas las llamadas al modelo y sus respaldos; si se acaba, Eli avisa que se está demorando. El log registra cuánto tardó cada respuesta.
- **Búsquedas (RNF-20):** una prueba comprueba que buscar horarios responde en menos de 2 s con más de 4.000 horarios.
- **PIN por WhatsApp (RNF-22):** se espera a Meta como máximo 4 s (`WHATSAPP_TIMEOUT_SEGUNDOS`); si no llega, se avisa y se puede pedir otro sin esperar el minuto.
- **500 usuarios a la vez (RNF-21):** prueba de carga con pacientes que recorren "Agendar" (no deja datos):

```bash
docker compose exec api python -m app.scripts.prueba_carga --usuarios 500 --segundos 60 --procesos 6
```

Cumple si no falla ninguna petición y el 95 % responde en menos de 2 s. Resultado en un portátil (servidor de desarrollo, un solo proceso): 23.448 peticiones en 60 s (360 por segundo), 0 fallidas, p95 de 0,013 s.

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
| `CLAVE_CIFRADO_DATOS` | Llave AES-256 (32 bytes en base64) que cifra los datos médicos en la base de datos (RNF-23). Obligatoria fuera de desarrollo |
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
