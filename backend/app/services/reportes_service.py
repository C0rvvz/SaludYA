"""
Dashboard y Reportes del personal.

- Dashboard: HU-44 (citas del día), HU-48 (confirmaciones), HU-49
  (canales), HU-50 (inasistencias por especialidad), HU-51
  (inasistencias por paciente) y HU-52 (resumen general).
- Reportes: HU-68 (periodo), HU-69 (indicadores), HU-70 (tiempo en
  ocupar un cupo liberado), HU-72 (demanda por especialidad), HU-73
  (inasistencia por especialidad), HU-74 (tendencia) y HU-75 (canales).

Todo se calcula en cada consulta a partir de las citas, así que refleja
al instante lo que confirman, cancelan o reprograman pacientes y
personal (HU-48 criterio 4, HU-50 criterio 4, HU-68 criterio 3).

SUPUESTO: una cita pertenece al periodo por la FECHA DE LA CITA (no por
el día en que se agendó), y el periodo es el del calendario completo
(este mes, trimestre o año), incluidas las citas que aún no ocurren.
SUPUESTO: la cita original de una reprogramación no cuenta como cita
aparte (la nueva la reemplaza), pero su horario sí cuenta como cupo
liberado.
SUPUESTO: porcentaje de inasistencia = no asistió / (atendidas + no
asistió), es decir, solo sobre las citas que ya se cerraron.
SUPUESTO: una cancelación es "a tiempo" si se hizo con al menos
HORAS_CANCELACION_A_TIEMPO horas de anticipación (HU-69, criterio 3).
SUPUESTO: un cupo reasignado es un horario liberado por una cancelación
o reprogramación que después tomó otra cita (HU-44, HU-69, HU-70).
SUPUESTO: el canal utilizado es el que el paciente eligió al agendar
(canal_recordatorio) (HU-49, HU-75).
"""

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.cita import CanalContacto, Cita, EstadoCita
from app.repositories import cita_repository, especialidad_repository
from app.utils.tiempo import MESES, ZONA_COLOMBIA, hoy_en_colombia

# HU-68, criterio 2
PERIODOS = {"mes": "Este mes", "trimestre": "Este trimestre", "anio": "Este año"}

HORAS_CANCELACION_A_TIEMPO = 24

# Citas que ocupan su horario (las canceladas y reprogramadas lo liberaron).
VIGENTES = {EstadoCita.CONFIRMADA, EstadoCita.ATENDIDA, EstadoCita.NO_ASISTIO}
CERRADAS = {EstadoCita.ATENDIDA, EstadoCita.NO_ASISTIO}


def _primer_dia_del_mes(fecha: date, meses_despues: int = 0) -> date:
    m = fecha.month - 1 + meses_despues
    return date(fecha.year + m // 12, m % 12 + 1, 1)


def rango_del_periodo(periodo: str, hoy: date) -> tuple[date, date]:
    """HU-68: primer y último día de este mes, este trimestre o este año."""
    if periodo == "anio":
        return date(hoy.year, 1, 1), date(hoy.year, 12, 31)
    meses = 3 if periodo == "trimestre" else 1
    desde = date(hoy.year, (hoy.month - 1) // meses * meses + 1, 1)
    return desde, _primer_dia_del_mes(desde, meses) - timedelta(days=1)


def _tramos(periodo: str, desde: date, hasta: date, hoy: date) -> list[tuple[str, date, date]]:
    """HU-74: semanas (lunes a domingo) del mes o meses del trimestre/año, hasta el tramo actual."""
    tramos = []
    inicio = desde
    while inicio <= min(hasta, hoy):
        if periodo == "mes":
            fin = min(inicio + timedelta(days=6 - inicio.weekday()), hasta)
            etiqueta = f"Semana del {inicio.day} de {MESES[inicio.month - 1]}"
        else:
            fin = _primer_dia_del_mes(inicio, 1) - timedelta(days=1)
            etiqueta = MESES[inicio.month - 1].capitalize()
        tramos.append((etiqueta, inicio, fin))
        inicio = fin + timedelta(days=1)
    return tramos


def _porcentaje(parte: int, total: int) -> float | None:
    return round(100 * parte / total, 1) if total else None


def _a_tiempo(cita: Cita) -> bool:
    franja = cita.disponibilidad
    inicio = datetime.combine(franja.fecha, franja.hora, tzinfo=ZONA_COLOMBIA)
    return inicio - cita.cancelada_en >= timedelta(hours=HORAS_CANCELACION_A_TIEMPO)


def _cupos_liberados(citas: list[Cita]) -> list[tuple[Cita, timedelta | None]]:
    """
    Cada cita cancelada o reprogramada, con lo que tardó otra cita en
    tomar su horario (None si nadie lo ha tomado). Todas las citas de un
    mismo horario comparten su fecha, así que están en la misma lista.
    """
    creadas_por_franja = defaultdict(list)
    for c in citas:
        creadas_por_franja[c.disponibilidad_id].append(c.creado_en)

    cupos = []
    for c in citas:
        liberada = {
            EstadoCita.CANCELADA: c.cancelada_en,
            EstadoCita.REPROGRAMADA: c.reprogramada_en,
        }.get(c.estado)
        if liberada is None:
            continue
        siguiente = min((t for t in creadas_por_franja[c.disponibilidad_id] if t > liberada), default=None)
        cupos.append((c, siguiente - liberada if siguiente else None))
    return cupos


def direccion_de_la_tendencia(porcentajes: list[float | None]) -> str | None:
    """HU-74, criterio 3: compara los dos últimos tramos que ya tienen citas cerradas."""
    con_datos = [p for p in porcentajes if p is not None]
    if len(con_datos) < 2:
        return None
    antes, ahora = con_datos[-2], con_datos[-1]
    return "aumenta" if ahora > antes else "disminuye" if ahora < antes else "se_mantiene"


def _inasistencia(citas: list[Cita]) -> dict:
    cerradas = [c for c in citas if c.estado in CERRADAS]
    no_asistio = sum(1 for c in cerradas if c.estado == EstadoCita.NO_ASISTIO)
    return {
        "atendidas": len(cerradas) - no_asistio,
        "no_asistio": no_asistio,
        "porcentaje": _porcentaje(no_asistio, len(cerradas)),
    }


def reporte(db: Session, periodo: str) -> dict:
    hoy = hoy_en_colombia()
    desde, hasta = rango_del_periodo(periodo, hoy)
    # ponytail: agrega en Python todas las citas del periodo; pasar a GROUP BY en SQL si llegan a decenas de miles.
    todas = cita_repository.listar_para_personal(db, desde, hasta, limite=None)
    citas = [c for c in todas if c.estado != EstadoCita.REPROGRAMADA]
    vigentes = [c for c in citas if c.estado in VIGENTES]
    canceladas = [c for c in citas if c.estado == EstadoCita.CANCELADA]
    confirmadas = sum(1 for c in vigentes if c.asistencia_confirmada_en)
    cupos = _cupos_liberados(todas)
    tiempos = [t for _, t in cupos if t is not None]

    # --- HU-44: citas y horarios del día ---
    de_hoy = [c for c in citas if c.disponibilidad.fecha == hoy]
    vigentes_hoy = [c for c in de_hoy if c.estado in VIGENTES]
    cupos_hoy = [t for c, t in cupos if c.disponibilidad.fecha == hoy]
    confirmadas_hoy = sum(1 for c in vigentes_hoy if c.asistencia_confirmada_en)

    # --- HU-49 / HU-75: los 4 canales, del más usado al menos usado ---
    uso_canal = Counter(c.canal_recordatorio for c in citas)
    canales = sorted(
        ({"canal": canal.value, "cantidad": uso_canal[canal]} for canal in CanalContacto),
        key=lambda x: -x["cantidad"],
    )

    # --- HU-50 / HU-72 / HU-73: todas las especialidades, aunque no tengan citas ---
    por_especialidad = defaultdict(list)
    for c in citas:
        por_especialidad[c.disponibilidad.especialista.especialidad_id].append(c)
    especialidades = especialidad_repository.listar_especialidades(db)
    demanda = sorted(
        ({"nombre": e.nombre, "cantidad": len(por_especialidad[e.id])} for e in especialidades),
        key=lambda x: -x["cantidad"],
    )
    inasistencia_especialidad = sorted(
        ({"especialidad": e.nombre, **_inasistencia(por_especialidad[e.id])} for e in especialidades),
        key=lambda x: (-(x["porcentaje"] or 0), -x["no_asistio"]),
    )

    # --- HU-51: pacientes con al menos una inasistencia ---
    por_paciente = defaultdict(list)
    for c in citas:
        por_paciente[c.paciente_id].append(c)
    inasistencia_paciente = []
    for lista in por_paciente.values():
        faltas = [c for c in lista if c.estado == EstadoCita.NO_ASISTIO]
        if not faltas:
            continue
        ultima_falta = max(faltas, key=lambda c: (c.disponibilidad.fecha, c.disponibilidad.hora))
        inasistencia_paciente.append({
            "paciente_id": lista[0].paciente.id,
            "nombre": lista[0].paciente.nombre,
            "numero_documento": lista[0].paciente.numero_documento,
            "no_asistio": len(faltas),
            "citas": len(lista),
            "cita_id": ultima_falta.id,
        })
    inasistencia_paciente.sort(key=lambda x: (-x["no_asistio"], x["nombre"]))

    # --- HU-74: tendencia y si aumenta, disminuye o se mantiene ---
    tendencia = [
        {
            "etiqueta": etiqueta,
            "desde": inicio,
            "hasta": fin,
            **_inasistencia([c for c in citas if inicio <= c.disponibilidad.fecha <= fin]),
        }
        for etiqueta, inicio, fin in _tramos(periodo, desde, hasta, hoy)
    ]
    inasistencia = _inasistencia(citas)
    return {
        "periodo": periodo,
        "periodo_texto": PERIODOS[periodo],
        "desde": desde,
        "hasta": hasta,
        "hoy": {
            "fecha": hoy,
            "programadas": len(vigentes_hoy),
            "confirmadas": confirmadas_hoy,
            "pendientes": len(vigentes_hoy) - confirmadas_hoy,
            "canceladas": sum(1 for c in de_hoy if c.estado == EstadoCita.CANCELADA),
            "horarios_liberados": len(cupos_hoy),
            "horarios_reasignados": sum(1 for t in cupos_hoy if t is not None),
        },
        "citas": len(citas),
        "confirmadas": confirmadas,
        "sin_confirmar": len(vigentes) - confirmadas,
        "porcentaje_confirmadas": _porcentaje(confirmadas, len(vigentes)),
        "canceladas": len(canceladas),
        "canceladas_a_tiempo": sum(1 for c in canceladas if _a_tiempo(c)),
        "atendidas": inasistencia["atendidas"],
        "no_asistio": inasistencia["no_asistio"],
        "porcentaje_inasistencia": inasistencia["porcentaje"],
        "cupos_liberados": len(cupos),
        "cupos_reasignados": len(tiempos),
        "minutos_promedio_reasignacion": (
            round(sum(tiempos, timedelta()) / len(tiempos) / timedelta(minutes=1)) if tiempos else None
        ),
        "canales": canales,
        "demanda": demanda,
        "inasistencia_por_especialidad": inasistencia_especialidad,
        "inasistencia_por_paciente": inasistencia_paciente,
        "tendencia": tendencia,
        "tendencia_direccion": direccion_de_la_tendencia([t["porcentaje"] for t in tendencia]),
    }
