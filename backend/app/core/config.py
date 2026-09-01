"""
Configuración central de la aplicación.

Lee las variables de entorno (inyectadas por docker-compose desde el
archivo .env de la raíz del proyecto) usando pydantic-settings.

IMPORTANTE: en esta Parte 1 solo existen las variables necesarias para
levantar FastAPI y conectarse a PostgreSQL. Variables futuras
(JWT_SECRET, WHATSAPP_*, RESEND_API_KEY, OPENAI_API_KEY) se agregarán
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

    # --- JWT (HU-03: se emite tras validar el OTP correctamente) ---
    # SUPUESTO: la duración no está definida en ninguna fuente; 60
    # minutos es un valor razonable por defecto para una sesión de
    # paciente. Cambiable con JWT_EXPIRE_MINUTES sin tocar código.
    jwt_secret: str
    jwt_expire_minutes: int = 60

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
