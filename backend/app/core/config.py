"""
Configuración central de la aplicación.

Lee las variables de entorno (inyectadas por docker-compose desde el
archivo .env de la raíz del proyecto) usando pydantic-settings.

IMPORTANTE: en esta Parte 1 solo existen las variables necesarias para
levantar FastAPI y conectarse a PostgreSQL. Variables futuras
(JWT_SECRET, WHATSAPP_*, RESEND_API_KEY, IA_API_KEY) se agregarán
aquí mismo cuando lleguemos a las partes que las necesiten — no se
agregan antes para no dejar configuración "muerta" sin usar.
"""

import base64
import binascii

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SaludYA API"
    app_env: str = "development"

    # Inyectada directamente por docker-compose (ver docker-compose.yml,
    # servicio "api" -> environment -> DATABASE_URL)
    database_url: str

    # --- OTP (HU-02, HU-03, HU-04) — valores ya definidos por el equipo ---
    otp_expire_minutes: int = 5
    otp_max_intentos: int = 3
    otp_reenvio_segundos: int = 60

    # --- WhatsApp Cloud API (HU-02, HU-04) ---
    # "mock": no envía nada real, solo lo registra en logs (por defecto,
    #   mientras no haya credenciales reales configuradas).
    # "real": envía de verdad usando WhatsApp Cloud API de Meta.
    whatsapp_mode: str = "mock"
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = ""
    # Versión de la Graph API de Meta. Cada versión dura unos dos años;
    # al vencer, Meta pasa las llamadas a la más antigua vigente.
    whatsapp_api_version: str = "v26.0"
    # RNF-22: el PIN se genera y se envía en menos de 5 s. Lo máximo que se
    # espera a Meta; si no responde a tiempo, se le avisa al paciente.
    whatsapp_timeout_segundos: float = 4.0

    # --- JWT (HU-03: se emite tras validar el OTP correctamente) ---
    # SUPUESTO: la duración no está definida en ninguna fuente; 60
    # minutos es un valor razonable por defecto para una sesión de
    # paciente. Cambiable con JWT_EXPIRE_MINUTES sin tocar código.
    jwt_secret: str
    jwt_expire_minutes: int = 60

    # --- "No soy un robot" (Cloudflare Turnstile) ---
    # Llave secreta del servicio. Las de prueba de Cloudflare siempre
    # aprueban (1x0000000000000000000000000000000AA). Vacía = sin
    # verificación: solo se permite en desarrollo (ver _llaves_obligatorias).
    turnstile_secret: str = ""
    # Llave pública de la casilla. En desarrollo va en frontend/.env
    # (VITE_TURNSTILE_SITEKEY); en producción la pone el servidor en la
    # página (ver servidor.py), así no hay que compilar el frontend con ella.
    turnstile_sitekey: str = ""

    # --- Versión de demostración publicada en internet ---
    # Con WhatsApp simulado nadie recibe el código de ingreso: en la versión
    # de demostración se muestra en pantalla, con el aviso de que se usen
    # solo datos de prueba. Con WhatsApp real no tiene efecto.
    modo_demostracion: bool = False

    # --- IP del visitante detrás de un proxy (límite de intentos y auditoría) ---
    # Vacía: la IP de la conexión (desarrollo). En Render todas las visitas
    # llegan desde su proxy: ahí se usa "cf-connecting-ip", la cabecera que
    # pone Cloudflare y que el visitante no puede falsificar.
    cabecera_ip_cliente: str = ""

    # --- Caché del catálogo público (RNF-20 y RNF-21, ver routers/catalogo.py) ---
    # Segundos que se reutiliza una misma respuesta del catálogo y la búsqueda
    # de horarios. 0 = sin caché (así corren las pruebas).
    cache_catalogo_segundos: float = 2.0

    # --- Conexiones a PostgreSQL (RNF-21, ver core/database.py) ---
    # pool_size + max_overflow deben cubrir los 40 hilos de FastAPI. Con
    # varios procesos (uvicorn --workers N), N x 40 no debe pasar de
    # max_connections de PostgreSQL (100 por defecto).
    db_pool_size: int = 20
    db_max_overflow: int = 20

    # --- Cifrado de los datos médicos (RNF-23, ver core/cifrado.py) ---
    # Llave AES-256 (32 bytes en base64). Vacía = llave de desarrollo derivada
    # de JWT_SECRET: solo se permite en desarrollo (ver _llave_jwt_robusta).
    clave_cifrado_datos: str = ""
    # Llaves anteriores, separadas por coma: solo para leer lo cifrado antes de cambiarla.
    claves_cifrado_anteriores: str = ""

    # --- Sesiones (RNF-17 sesión única, RNF-24 inactividad) ---
    # La sesión se cierra tras estos minutos sin ninguna actividad; el JWT
    # además deja de servir a los jwt_expire_minutes aunque haya actividad.
    sesion_inactividad_minutos: float = 2

    # --- Tareas en segundo plano (recordatorios HU-22, cierre de citas HU-25) ---
    tareas_periodicas_activas: bool = True
    tareas_intervalo_segundos: int = 300

    # --- Recordatorios de cita (HU-22) ---
    # SUPUESTO: "anticipación suficiente" no está definida en ninguna
    # fuente; 24 horas es lo habitual en citas médicas. Cambiable sin
    # tocar código.
    recordatorio_anticipacion_horas: int = 24
    recordatorio_max_intentos: int = 3
    # Enlace que va en el recordatorio para confirmar la asistencia (HU-23).
    # En Render, si no se define, se usa la dirección pública que Render
    # pone en RENDER_EXTERNAL_URL.
    frontend_url: str = Field(
        "http://localhost:5173", validation_alias=AliasChoices("frontend_url", "render_external_url")
    )

    # --- Lista de espera (HU-31, HU-32) ---
    # SUPUESTO: ninguna fuente define el plazo; el cupo liberado se le
    # reserva al paciente 2 horas para aceptarlo antes de pasar al siguiente.
    lista_espera_plazo_minutos: int = 120

    # --- El día de la consulta (HU-24, HU-25) ---
    # SUPUESTO: ninguna fuente define estas ventanas. Registrar la
    # llegada se habilita 2 h antes de la cita y hasta 30 min después;
    # 60 min después del inicio la cita se cierra como "atendida" (si
    # registró su llegada) o "no asistió" (si no).
    llegada_minutos_antes: int = 120
    llegada_minutos_despues: int = 30
    cierre_minutos_despues: int = 60

    # --- Asistente conversacional con IA (HU-33) ---
    # Cualquier proveedor compatible con la API de OpenAI: el paquete
    # "openai" solo necesita la URL base, la llave y el modelo.
    #   - Gemini (plan gratuito): IA_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
    #   - OpenAI: IA_BASE_URL vacía y IA_MODELO=gpt-4o-mini
    # La API key vive SOLO aquí, en el backend: el frontend nunca la ve.
    # Vacía por defecto para que la API arranque aunque no esté
    # configurada; en ese caso solo el chat responde con un error claro.
    ia_api_key: str = ""
    ia_base_url: str = ""
    ia_modelo: str = "gpt-4o-mini"
    # Modelos de respaldo, separados por coma, en orden de preferencia.
    # Se usan solo si el anterior responde "alta demanda", límite de
    # solicitudes o no responde a tiempo. Vacío = sin respaldo.
    ia_modelos_respaldo: str = ""
    # RNF-18: Eli responde cada mensaje del paciente en menos de 10 s. Este
    # es el tiempo total por mensaje (todas las llamadas al modelo y los
    # respaldos); si se acaba, se le avisa al paciente en vez de hacerlo esperar.
    ia_presupuesto_segundos: float = 9.0
    # Máximo para un solo intento con un modelo (dentro del presupuesto).
    ia_timeout_segundos: float = 8.0

    @property
    def codigo_otp_en_pantalla(self) -> bool:
        """
        Modo demostración: con WhatsApp simulado y en desarrollo, la API
        devuelve el código de verificación para que la pantalla de ingreso
        lo muestre (si no, solo se ve en el log). Nunca con WhatsApp real
        ni en otro entorno: ahí rige HU-02, criterio 4 (el código no debe
        ser visible dentro de la plataforma).
        """
        return self.whatsapp_mode == "mock" and (self.app_env == "development" or self.modo_demostracion)

    @property
    def ia_modelos(self) -> list[str]:
        respaldo = [m.strip() for m in self.ia_modelos_respaldo.split(",") if m.strip()]
        return [self.ia_modelo, *respaldo]

    # --- CORS (necesario para que el frontend en localhost:5173 pueda
    # llamar a este backend en localhost:8000 -- el navegador bloquea
    # las peticiones entre orígenes distintos si no se habilita) ---
    cors_origins: str = "http://localhost:5173"

    # hide_input_in_errors: si una variable está mal, el error (que va a los logs de la
    # plataforma) dice cuál regla falló, nunca los valores, que incluyen llaves y contraseñas.
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, hide_input_in_errors=True)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("database_url")
    @classmethod
    def _url_de_sqlalchemy(cls, url: str) -> str:
        # Algunos servicios entregan "postgres://...", que SQLAlchemy ya no acepta.
        return "postgresql://" + url.removeprefix("postgres://") if url.startswith("postgres://") else url

    @property
    def es_desarrollo(self) -> bool:
        return self.app_env == "development"

    @model_validator(mode="after")
    def _llave_jwt_robusta(self) -> "Settings":
        # Con una llave corta se pueden adivinar (y falsificar) los tokens a
        # fuerza bruta. Fuera de desarrollo, la API no arranca con una débil.
        if not self.es_desarrollo and len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET debe tener al menos 32 caracteres fuera de desarrollo.")
        # Sin la verificación de robots, los ingresos quedan expuestos a bots.
        if not self.es_desarrollo and not self.turnstile_secret:
            raise ValueError("TURNSTILE_SECRET es obligatoria fuera de desarrollo.")
        # RNF-23: sin su propia llave, los datos médicos no quedarían bien protegidos.
        if not self.es_desarrollo and not self.clave_cifrado_datos:
            raise ValueError("CLAVE_CIFRADO_DATOS es obligatoria fuera de desarrollo.")
        for llave in [self.clave_cifrado_datos, *self.claves_cifrado_anteriores.split(",")]:
            if llave.strip():
                try:
                    if len(base64.b64decode(llave.strip(), validate=True)) != 32:
                        raise ValueError
                except (binascii.Error, ValueError):
                    raise ValueError("Las llaves de cifrado deben ser de 32 bytes (AES-256), escritas en base64.")
        return self


settings = Settings()
