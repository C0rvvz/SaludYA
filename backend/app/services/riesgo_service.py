"""
Nivel estimado de inasistencia — HU-34 (criterio 3) y HU-35 (criterio 4:
"factores asociados a la cancelación o inasistencia").

NO es un modelo entrenado: todavía no hay datos históricos suficientes
para entrenar uno. Es un cálculo por reglas, transparente: cada factor
suma o resta puntos y queda escrito, para que el personal vea por qué la
cita tiene ese nivel. Cuando haya datos reales, este módulo es el lugar
para reemplazar las reglas por un modelo, sin cambiar lo demás.

Es una recomendación de acompañamiento (llamar, recordar, confirmar):
NUNCA debe usarse para negar o quitar una cita a un paciente.
"""

from dataclasses import dataclass, field

from app.models.cita import Cita, EstadoCita
from app.services import citas_service
from app.utils.tiempo import ZONA_COLOMBIA, ahora_colombia

_BASE = 10
_UMBRAL_MEDIO = 30
_UMBRAL_ALTO = 55


@dataclass
class EstimacionRiesgo:
    porcentaje: int
    nivel: str  # "bajo" | "medio" | "alto"
    factores: list[str] = field(default_factory=list)


def _plural(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def estimar(cita: Cita, otras_del_paciente: list[Cita]) -> EstimacionRiesgo | None:
    """
    `otras_del_paciente`: las demás citas del mismo paciente (sin incluir
    `cita`). Devuelve None si la cita ya no va a ocurrir (no hay nada que
    estimar).
    """
    if citas_service.estado_visible(cita) not in citas_service.ESTADOS_ACTIVOS:
        return None
    if cita.llegada_registrada_en is not None:
        return EstimacionRiesgo(0, "bajo", ["Ya registró su llegada a la sede."])

    puntos = _BASE
    factores: list[str] = []

    # --- Comportamiento en citas anteriores ---
    faltas = sum(1 for c in otras_del_paciente if c.estado == EstadoCita.NO_ASISTIO)
    atendidas = sum(1 for c in otras_del_paciente if c.estado == EstadoCita.ATENDIDA)
    canceladas = sum(1 for c in otras_del_paciente if c.estado == EstadoCita.CANCELADA)
    reprogramadas = sum(1 for c in otras_del_paciente if c.estado == EstadoCita.REPROGRAMADA)

    if faltas:
        puntos += min(40, 20 * faltas)
        factores.append(f"No asistió a {_plural(faltas, 'cita anterior', 'citas anteriores')}.")
    if canceladas:
        puntos += min(15, 5 * canceladas)
        factores.append(f"Canceló {_plural(canceladas, 'cita', 'citas')} antes.")
    if reprogramadas:
        puntos += min(10, 5 * reprogramadas)
        factores.append(f"Reprogramó {_plural(reprogramadas, 'cita', 'citas')} antes.")
    if atendidas and not faltas:
        puntos -= min(10, 5 * atendidas)
        factores.append(
            f"Asistió a {_plural(atendidas, 'cita anterior', 'citas anteriores')} (reduce el riesgo)."
        )
    if not otras_del_paciente:
        factores.append("Es su primera cita: todavía no hay historial para comparar.")

    # --- Esta cita ---
    inicio = citas_service.inicio_de(cita)
    horas_para_la_cita = (inicio - ahora_colombia()).total_seconds() / 3600
    if cita.asistencia_confirmada_en is not None:
        puntos -= 15
        factores.append("Confirmó su asistencia (reduce el riesgo).")
    elif horas_para_la_cita < 48:
        puntos += 15
        factores.append("Aún no confirma su asistencia y la cita es en menos de 48 horas.")
    else:
        puntos += 5
        factores.append("Aún no confirma su asistencia.")

    agendada = cita.creado_en.astimezone(ZONA_COLOMBIA).date()
    anticipacion = (inicio.date() - agendada).days
    if anticipacion >= 14:
        puntos += 10
        factores.append(f"Agendó con {anticipacion} días de anticipación.")

    if cita.recordatorio_intentos and cita.recordatorio_enviado_en is None:
        puntos += 5
        factores.append("No se ha podido enviar el recordatorio.")

    porcentaje = max(1, min(95, puntos))
    nivel = "bajo" if porcentaje < _UMBRAL_MEDIO else "medio" if porcentaje < _UMBRAL_ALTO else "alto"
    return EstimacionRiesgo(porcentaje, nivel, factores)
