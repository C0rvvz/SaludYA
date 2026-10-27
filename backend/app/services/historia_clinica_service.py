"""
Personal › Historia clínica: el diagnóstico y la fórmula médica de los
pacientes atendidos. Es información reservada:

- Solo con el permiso historia_clinica (roles Médico y Coordinación médica;
  core/permisos.py). El administrador no la ve.
- El Médico solo ve a SUS pacientes: los que atendió o tienen cita con él
  (su cuenta es la de un médico de la red, Personal.especialista_id), y
  solo registra o corrige la fórmula de las consultas que él atendió.
- Cada consulta del detalle queda en la auditoría (ver_historia_clinica) y
  aparece en "Quién ha consultado esta fórmula", junto con quién la
  registró, las entregas en farmacia y los reenvíos del código.

listar(): un paciente por fila, con su última consulta atendida del periodo.
detalle(): una consulta atendida con su fórmula y las demás del paciente.
"""

import unicodedata
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, contains_eager, joinedload, selectinload

from app.models.auditoria import RegistroAuditoria
from app.models.cita import Cita, EstadoCita
from app.models.disponibilidad import Disponibilidad
from app.models.especialista import Especialista
from app.models.paciente import Paciente
from app.models.personal import Personal, RolPersonal
from app.repositories import cita_repository
from app.services import admin_citas_service, auditoria_service, formulas_service
from app.services.auditoria_service import Actor
from app.services.exceptions import FormulaInvalidaError, HistoriaClinicaRestringidaError
from app.utils.tiempo import hoy_en_colombia

POR_PAGINA = 20
# Si la misma persona vuelve a abrir la misma consulta enseguida (recargar la
# página), no se repite el registro.
REPETIDA_DENTRO_DE = timedelta(minutes=2)

# Lo que se muestra en "Quién ha consultado esta fórmula", según la acción auditada.
ACCESOS = {
    "registrar_formula": "Registró la fórmula",
    "entrega_farmacia": "Entrega con código",
    "reenviar_codigo_formula": "Reenvió el código al paciente",
    "ver_historia_clinica": "Consultó la historia clínica",
}
SIN_FORMULA = ("sin_formula", "Sin fórmula")


def _sin_tildes(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def _pacientes_del_medico(db: Session, personal: Personal):
    """Los pacientes del médico de esta cuenta: los que atendió y los que tienen cita con él."""
    return (
        db.query(Cita.paciente_id)
        .join(Cita.disponibilidad)
        .filter(
            Disponibilidad.especialista_id == personal.especialista_id,
            Cita.estado.in_([EstadoCita.ATENDIDA, EstadoCita.CONFIRMADA]),
        )
    )


def es_su_paciente(db: Session, personal: Personal, paciente_id: uuid.UUID) -> bool:
    if personal.rol != RolPersonal.MEDICO:
        return True
    if personal.especialista_id is None:
        return False
    return _pacientes_del_medico(db, personal).filter(Cita.paciente_id == paciente_id).first() is not None


def _estado_formula(cita: Cita) -> tuple[str, str]:
    if cita.formula is None:
        return SIN_FORMULA
    estado = formulas_service.estado_entrega(cita.formula)
    return estado, formulas_service.ESTADOS_ENTREGA[estado]


def _consultas_atendidas(db: Session):
    return (
        db.query(Cita)
        .join(Cita.disponibilidad)
        .join(Disponibilidad.especialista)
        .options(
            contains_eager(Cita.disponibilidad).contains_eager(Disponibilidad.especialista)
            .joinedload(Especialista.especialidad),
            joinedload(Cita.paciente).joinedload(Paciente.eps),
            selectinload(Cita.formula),
        )
        .filter(Cita.estado == EstadoCita.ATENDIDA)
        .order_by(Disponibilidad.fecha.desc(), Disponibilidad.hora.desc())
    )


def listar(
    db: Session,
    personal: Personal,
    buscar: str | None = None,
    especialidad_id: uuid.UUID | None = None,
    eps_id: str | None = None,  # el id de una EPS o "particular"
    dias: int | None = 30,
    pagina: int = 1,
) -> dict:
    consulta = _consultas_atendidas(db)
    if dias:
        consulta = consulta.filter(Disponibilidad.fecha >= hoy_en_colombia() - timedelta(days=dias))
    if especialidad_id:
        consulta = consulta.filter(Especialista.especialidad_id == especialidad_id)
    if personal.rol == RolPersonal.MEDICO:
        if personal.especialista_id is None:
            return {"total": 0, "pagina": 1, "por_pagina": POR_PAGINA, "pacientes": []}
        consulta = consulta.filter(Cita.paciente_id.in_(_pacientes_del_medico(db, personal)))

    ultimas: dict[uuid.UUID, Cita] = {}
    for cita in consulta.all():  # de la más reciente a la más antigua
        ultimas.setdefault(cita.paciente_id, cita)
    filas = list(ultimas.values())
    if eps_id == "particular":
        filas = [c for c in filas if c.paciente.eps_id is None]
    elif eps_id:
        filas = [c for c in filas if str(c.paciente.eps_id) == eps_id]
    if buscar and buscar.strip():
        texto = _sin_tildes(" ".join(buscar.split()))
        filas = [c for c in filas if texto in _sin_tildes(c.paciente.nombre) or texto in c.paciente.numero_documento]

    total = len(filas)
    pagina = max(1, min(pagina, (total + POR_PAGINA - 1) // POR_PAGINA or 1))
    filas = filas[(pagina - 1) * POR_PAGINA: pagina * POR_PAGINA]
    consultado = dict(
        db.query(RegistroAuditoria.paciente_id, func.max(RegistroAuditoria.fecha))
        .filter(
            RegistroAuditoria.accion == "ver_historia_clinica",
            RegistroAuditoria.paciente_id.in_([c.paciente_id for c in filas]),
        )
        .group_by(RegistroAuditoria.paciente_id)
        .all()
    ) if filas else {}

    def fila(cita: Cita) -> dict:
        p, franja = cita.paciente, cita.disponibilidad
        estado, texto = _estado_formula(cita)
        return {
            "paciente_id": p.id,
            "cita_id": cita.id,
            "nombre": p.nombre,
            "tipo_documento": p.tipo_documento.value,
            "numero_documento": p.numero_documento,
            "eps": p.eps.nombre if p.eps else None,
            "fecha": franja.fecha,
            "especialidad": franja.especialista.especialidad.nombre,
            "especialista": franja.especialista.nombre,
            "formula_estado": estado,
            "formula_estado_texto": texto,
            "consultado_en": consultado.get(p.id),
        }

    return {"total": total, "pagina": pagina, "por_pagina": POR_PAGINA, "pacientes": [fila(c) for c in filas]}


def _cita_con_acceso(db: Session, personal: Personal, cita_id: uuid.UUID) -> Cita:
    cita = admin_citas_service.obtener_cita(db, cita_id)
    if not es_su_paciente(db, personal, cita.paciente_id):
        raise HistoriaClinicaRestringidaError(
            "Solo puede ver la historia clínica de sus pacientes: los que usted atendió o tienen cita con usted."
        )
    if cita.estado != EstadoCita.ATENDIDA:
        raise FormulaInvalidaError("Esta cita no fue atendida: no tiene diagnóstico ni fórmula.")
    return cita


def _puede_editar(personal: Personal, cita: Cita) -> bool:
    """Coordinación médica corrige cualquiera; el médico, solo las consultas que él atendió."""
    return personal.rol != RolPersonal.MEDICO or cita.disponibilidad.especialista_id == personal.especialista_id


def _registrar_consulta(db: Session, personal: Personal, cita: Cita) -> None:
    # Bloquea la cita hasta el commit: si llegan dos a la vez (p. ej. la página pide dos veces),
    # la segunda espera y ya ve el registro de la primera.
    cita_repository.obtener_con_lock(db, cita.id)
    reciente = (
        db.query(RegistroAuditoria.id)
        .filter(
            RegistroAuditoria.accion == "ver_historia_clinica",
            RegistroAuditoria.cita_id == cita.id,
            RegistroAuditoria.actor_id == personal.id,
            RegistroAuditoria.fecha >= datetime.now(timezone.utc) - REPETIDA_DENTRO_DE,
        )
        .first()
    )
    if reciente is None:
        auditoria_service.registrar(
            db, Actor.de_personal(personal), "ver_historia_clinica",
            f"Consultó la historia clínica de {cita.paciente.nombre}", cita=cita,
        )
        db.commit()


def _accesos(db: Session, cita: Cita) -> list[dict]:
    """Quién ha consultado esta fórmula: una línea por persona y acción, con la última vez."""
    registros = (
        db.query(RegistroAuditoria)
        .filter(RegistroAuditoria.cita_id == cita.id, RegistroAuditoria.accion.in_(ACCESOS))
        .order_by(RegistroAuditoria.fecha)
        .all()
    )
    agrupados: dict[tuple[str, str], dict] = {}
    for r in registros:
        clave = (r.actor_nombre, r.accion)
        acceso = agrupados.setdefault(clave, {"quien": r.actor_nombre, "que": ACCESOS[r.accion], "veces": 0})
        acceso["fecha"] = r.fecha
        acceso["veces"] += 1
    return sorted(agrupados.values(), key=lambda a: a["fecha"])


def _consulta(cita: Cita) -> dict:
    """Una consulta atendida del paciente, para pasar de una a otra en el detalle."""
    estado, texto = _estado_formula(cita)
    return {
        "cita_id": cita.id,
        "fecha": cita.disponibilidad.fecha,
        "especialidad": cita.disponibilidad.especialista.especialidad.nombre,
        "especialista": cita.disponibilidad.especialista.nombre,
        "formula_estado": estado,
        "formula_estado_texto": texto,
    }


def _datos(db: Session, personal: Personal, cita: Cita) -> dict:
    p, franja = cita.paciente, cita.disponibilidad
    consultas = _consultas_atendidas(db).filter(Cita.paciente_id == p.id).all()
    return {
        "paciente": {
            "id": p.id,
            "nombre": p.nombre,
            "tipo_documento": p.tipo_documento.value,
            "numero_documento": p.numero_documento,
            "eps": p.eps.nombre if p.eps else None,
        },
        "cita": {
            "id": cita.id,
            "numero_comprobante": cita.numero_comprobante,
            "fecha": franja.fecha,
            "hora": franja.hora,
            "especialidad": franja.especialista.especialidad.nombre,
            "especialista": franja.especialista.nombre,
            "sede": franja.sede.nombre,
            "canal": cita.canal_recordatorio.value,
        },
        "formula": formulas_service.datos(cita.formula) if cita.formula else None,
        "qr": formulas_service.qr(cita.formula) if cita.formula else None,
        "consultas": [_consulta(c) for c in consultas],
        "accesos": _accesos(db, cita),
        "puede_editar": _puede_editar(personal, cita),
    }


def detalle(db: Session, personal: Personal, cita_id: uuid.UUID) -> dict:
    """Abrir la consulta queda en la auditoría (antes de armar "Quién ha consultado", para que salga ahí)."""
    cita = _cita_con_acceso(db, personal, cita_id)
    _registrar_consulta(db, personal, cita)
    return _datos(db, personal, cita)


def registrar_formula(db: Session, personal: Personal, cita_id: uuid.UUID, datos: dict) -> dict:
    cita = _cita_con_acceso(db, personal, cita_id)
    if not _puede_editar(personal, cita):
        raise HistoriaClinicaRestringidaError("Solo puede registrar o corregir la fórmula de las consultas que usted atendió.")
    formulas_service.registrar(db, Actor.de_personal(personal), cita.id, **datos)
    db.refresh(cita)
    return _datos(db, personal, cita)


def reenviar_codigo(db: Session, personal: Personal, cita_id: uuid.UUID) -> str:
    cita = _cita_con_acceso(db, personal, cita_id)
    return formulas_service.reenviar_codigo(db, Actor.de_personal(personal), cita)
