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

from collections import Counter
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


def _por_historial(otras: list[Cita]) -> tuple[int, list[str]]:
    """Puntos y factores por el comportamiento en citas anteriores."""
    cuenta = Counter(c.estado for c in otras)
    faltas, atendidas = cuenta[EstadoCita.NO_ASISTIO], cuenta[EstadoCita.ATENDIDA]
    canceladas, reprogramadas = cuenta[EstadoCita.CANCELADA], cuenta[EstadoCita.REPROGRAMADA]
    puntos = 0
    factores: list[str] = []
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
    if not otras:
        factores.append("Es su primera cita: todavía no hay historial para comparar.")
    return puntos, factores


def _por_esta_cita(cita: Cita) -> tuple[int, list[str]]:
    """Puntos y factores de la cita misma: confirmación, anticipación y recordatorio."""
    inicio = citas_service.inicio_de(cita)
    horas_para_la_cita = (inicio - ahora_colombia()).total_seconds() / 3600
    if cita.asistencia_confirmada_en is not None:
        puntos, factores = -15, ["Confirmó su asistencia (reduce el riesgo)."]
    elif horas_para_la_cita < 48:
        puntos, factores = 15, ["Aún no confirma su asistencia y la cita es en menos de 48 horas."]
    else:
        puntos, factores = 5, ["Aún no confirma su asistencia."]

    agendada = cita.creado_en.astimezone(ZONA_COLOMBIA).date()
    anticipacion = (inicio.date() - agendada).days
    if anticipacion >= 14:
        puntos += 10
        factores.append(f"Agendó con {anticipacion} días de anticipación.")

    if cita.recordatorio_intentos and cita.recordatorio_enviado_en is None:
        puntos += 5
        factores.append("No se ha podido enviar el recordatorio.")
    return puntos, factores


def _nivel(porcentaje: int) -> str:
    if porcentaje < _UMBRAL_MEDIO:
        return "bajo"
    return "medio" if porcentaje < _UMBRAL_ALTO else "alto"


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

    puntos_historial, factores_historial = _por_historial(otras_del_paciente)
    puntos_cita, factores_cita = _por_esta_cita(cita)
    porcentaje = max(1, min(95, _BASE + puntos_historial + puntos_cita))
    return EstimacionRiesgo(porcentaje, _nivel(porcentaje), factores_historial + factores_cita)
