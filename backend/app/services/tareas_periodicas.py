"""
Tareas de fondo que corren dentro de la API (ver main.py):

- HU-22: enviar los recordatorios de las próximas citas.
- HU-25: cerrar las citas que ya ocurrieron (atendida / no asistió).
- HU-64 / HU-65: enviar los recordatorios programados que llegaron a su hora.
- HU-31: vencer los cupos ofrecidos sin respuesta y ofrecer cupos a la
  lista de espera.
- Generar otra tanda de franjas de disponibilidad cuando se acaban las
  futuras (ver disponibilidad_service.py).

Cada pasada usa su propia sesión de base de datos. Un error en una
tarea no detiene la otra ni las pasadas siguientes.
"""

import asyncio
import logging

from app.core.config import settings
from app.core.database import SessionLocal
from app.services import (
    centro_recordatorios_service,
    citas_service,
    disponibilidad_service,
    lista_espera_service,
    recordatorios_service,
)

logger = logging.getLogger("saludya.tareas")


def _recordatorios() -> None:
    db = SessionLocal()
    try:
        enviados = recordatorios_service.enviar_recordatorios_pendientes(db)
        if enviados:
            logger.info("Recordatorios enviados: %s", enviados)
    finally:
        db.close()


def _programados() -> None:
    db = SessionLocal()
    try:
        enviados = centro_recordatorios_service.enviar_programados_vencidos(db)
        if enviados:
            logger.info("Recordatorios programados enviados: %s", enviados)
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


def _reposicion_de_disponibilidad() -> None:
    db = SessionLocal()
    try:
        tanda = disponibilidad_service.reponer_si_se_agoto(db)
        if tanda and tanda.creadas:
            logger.info(
                "Disponibilidad repuesta: %s franjas, del %s al %s",
                tanda.creadas, tanda.desde, tanda.hasta,
            )
    finally:
        db.close()


def _lista_espera() -> None:
    db = SessionLocal()
    try:
        vencidas = lista_espera_service.vencer_ofertas(db)
        ofrecidos = lista_espera_service.asignar_cupos(db)
        if vencidas or ofrecidos:
            logger.info("Lista de espera: %s cupos vencidos, %s ofrecidos", vencidas, ofrecidos)
    finally:
        db.close()


async def ejecutar_periodicamente() -> None:
    while True:
        for tarea in (
            _recordatorios,
            _programados,
            _cierre_de_citas,
            _reposicion_de_disponibilidad,
            _lista_espera,  # después de reponer: los horarios nuevos también se ofrecen
        ):
            try:
                await asyncio.to_thread(tarea)
            except Exception:
                logger.exception("Falló la tarea %s; se reintenta en la próxima pasada.", tarea.__name__)
        await asyncio.sleep(settings.tareas_intervalo_segundos)
