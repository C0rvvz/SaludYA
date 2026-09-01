"""
Configuración de logging de la aplicación.

Sin esto, los logger.info(...) de nuestros propios módulos (por
ejemplo app.integrations.whatsapp.client) no aparecen en la salida
del contenedor -- Python no imprime nada por debajo de WARNING si no
hay un logging configurado explícitamente. Uvicorn configura su
propio logger de acceso (las líneas "GET /health 200 OK"), pero eso
es independiente de nuestros loggers de aplicación.
"""

import logging


def configurar_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
