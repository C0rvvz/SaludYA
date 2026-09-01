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

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
