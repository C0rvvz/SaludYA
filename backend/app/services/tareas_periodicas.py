"""
Tareas de fondo que corren dentro de la API (ver main.py):

- HU-22: enviar los recordatorios de las próximas citas.
- HU-25: cerrar las citas que ya ocurrieron (atendida / no asistió).

Cada pasada usa su propia sesión de base de datos. Un error en una
tarea no detiene la otra ni las pasadas siguientes.
"""

import asyncio
import logging

from app.core.config import settings
from app.core.database import SessionLocal
from app.services import citas_service, recordatorios_service

logger = logging.getLogger("saludya.tareas")


def _recordatorios() -> None:
    db = SessionLocal()
    try:
        enviados = recordatorios_service.enviar_recordatorios_pendientes(db)
        if enviados:
            logger.info("Recordatorios enviados: %s", enviados)
    finally:
        db.close()


def _cierre_de_citas() -> None:
    db = SessionLocal()
    try:
        atendidas, inasistencias = citas_service.cerrar_citas_pasadas(db)
        if atendidas or inasistencias:
            logger.info("Citas cerradas: %s atendidas, %s sin asistencia", atendidas, inasistencias)
    finally:
        db.close()


async def ejecutar_periodicamente() -> None:
    while True:
        for tarea in (_recordatorios, _cierre_de_citas):
            try:
                await asyncio.to_thread(tarea)
            except Exception:
                logger.exception("Falló la tarea %s; se reintenta en la próxima pasada.", tarea.__name__)
        await asyncio.sleep(settings.tareas_intervalo_segundos)
