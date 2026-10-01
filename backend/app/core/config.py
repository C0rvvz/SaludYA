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

    # --- JWT (HU-03: se emite tras validar el OTP correctamente) ---
    # SUPUESTO: la duración no está definida en ninguna fuente; 60
    # minutos es un valor razonable por defecto para una sesión de
    # paciente. Cambiable con JWT_EXPIRE_MINUTES sin tocar código.
    jwt_secret: str
    jwt_expire_minutes: int = 60

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
    frontend_url: str = "http://localhost:5173"

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
    # Las respuestas normales tardan 1-9 s. Por mensaje, se deja de
    # probar modelos de respaldo tras 2x este valor en total.
    ia_timeout_segundos: float = 15.0

    @property
    def codigo_otp_en_pantalla(self) -> bool:
        """
        Modo demostración: con WhatsApp simulado y en desarrollo, la API
        devuelve el código de verificación para que la pantalla de ingreso
        lo muestre (si no, solo se ve en el log). Nunca con WhatsApp real
        ni en otro entorno: ahí rige HU-02, criterio 4 (el código no debe
        ser visible dentro de la plataforma).
        """
        return self.whatsapp_mode == "mock" and self.app_env == "development"

    @property
    def ia_modelos(self) -> list[str]:
        respaldo = [m.strip() for m in self.ia_modelos_respaldo.split(",") if m.strip()]
        return [self.ia_modelo, *respaldo]

    # --- CORS (necesario para que el frontend en localhost:5173 pueda
    # llamar a este backend en localhost:8000 -- el navegador bloquea
    # las peticiones entre orígenes distintos si no se habilita) ---
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
