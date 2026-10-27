"""
Fórmula médica de una cita atendida y dónde reclamarla.

- registrar(): el personal (coordinador médico o administrador) escribe o
  corrige lo que formuló el médico. Solo para citas atendidas. La primera
  vez se le avisa al paciente por el canal de su cita.
- de_mi_cita(): lo que ve el paciente en Mis citas: la fórmula, el QR de su
  código y las farmacias donde reclamar (las cercanas a su sede primero).
- simular_desde_ips(): la IPS (simulada) manda la fórmula de las citas
  atendidas que todavía no la tienen, como si llegara del sistema del médico.

El código del QR va firmado (HMAC): una farmacia puede comprobar que lo
generó SaludYA y que no lo cambiaron.

SUPUESTO: la fórmula vale 30 días (VIGENCIA_DIAS) desde que se registra.
"""

import hashlib
import hmac
import json
import random
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

import segno
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import Cita, EstadoCita
from app.models.formula_medica import Farmacia, FormulaMedica
from app.services import auditoria_service, citas_service
from app.services.auditoria_service import Actor
from app.services.exceptions import CitaNoEncontradaError, FormulaInvalidaError
from app.utils.tiempo import fecha_legible, hoy_en_colombia

VIGENCIA_DIAS = 30


def _codigo_nuevo(db: Session) -> str:
    while True:
        codigo = f"FM-{hoy_en_colombia().year}-{secrets.randbelow(100_000):05d}"
        if not db.query(FormulaMedica.id).filter(FormulaMedica.codigo == codigo).first():
            return codigo


def _firma(codigo: str, vence_en: date) -> str:
    llave = hashlib.sha256(b"saludya-formula:" + settings.jwt_secret.encode()).digest()
    return hmac.new(llave, f"{codigo}|{vence_en.isoformat()}".encode(), hashlib.sha256).hexdigest()[:16].upper()


def contenido_qr(formula: FormulaMedica) -> str:
    """Lo que lleva el QR: el código, hasta cuándo vale y su firma."""
    return f"SALUDYA-FORMULA|{formula.codigo}|{formula.vence_en.isoformat()}|{_firma(formula.codigo, formula.vence_en)}"


def qr(formula: FormulaMedica) -> str:
    """El QR como imagen SVG (data URI), en el azul marino de la marca."""
    return segno.make(contenido_qr(formula), error="m").svg_data_uri(scale=4, dark="#0e1f39", border=2)


def _limpiar_medicamentos(medicamentos: list[dict]) -> list[dict]:
    limpios = []
    for m in medicamentos:
        fila = {campo: " ".join(str(m.get(campo) or "").split()) for campo in
                ("nombre", "dosis", "indicacion", "duracion", "cantidad")}
        if fila["nombre"]:
            if not fila["indicacion"]:
                raise FormulaInvalidaError(f"Escriba cómo tomar {fila['nombre']} (p. ej. «1 tableta cada 8 horas»).")
            limpios.append(fila)
    return limpios


def registrar(
    db: Session,
    actor: Actor,
    cita_id: uuid.UUID,
    diagnostico: str,
    nota: str | None,
    medicamentos: list[dict],
    recomendaciones: list[str],
    cubierta_por_eps: bool = True,
) -> FormulaMedica:
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise CitaNoEncontradaError("No existe esa cita.")
    if cita.estado != EstadoCita.ATENDIDA:
        raise FormulaInvalidaError("Solo se registra la fórmula de una cita atendida.")
    diagnostico = " ".join(diagnostico.split())
    if not diagnostico:
        raise FormulaInvalidaError("Escriba el diagnóstico.")
    medicamentos = _limpiar_medicamentos(medicamentos)
    recomendaciones = [r.strip() for r in recomendaciones if r and r.strip()]
    if not medicamentos and not recomendaciones:
        raise FormulaInvalidaError("Agregue al menos un medicamento o una recomendación.")

    formula = cita.formula
    nueva = formula is None
    if nueva:
        formula = FormulaMedica(cita=cita, codigo=_codigo_nuevo(db))
        db.add(formula)
    formula.diagnostico = diagnostico
    formula.nota = (nota or "").strip() or None
    formula.medicamentos = json.dumps(medicamentos, ensure_ascii=False)
    formula.recomendaciones = json.dumps(recomendaciones, ensure_ascii=False)
    formula.cubierta_por_eps = cubierta_por_eps
    formula.registrada_en = datetime.now(timezone.utc)
    formula.registrada_por = actor.nombre
    formula.vence_en = hoy_en_colombia() + timedelta(days=VIGENCIA_DIAS)
    # En la auditoría no va lo clínico: solo que se registró y cuántos medicamentos.
    n = len(medicamentos)
    auditoria_service.registrar(
        db, actor, "registrar_formula",
        f"{'Registró' if nueva else 'Corrigió'} la fórmula médica ({n} medicamento{'' if n == 1 else 's'})",
        cita=cita,
    )
    db.commit()
    db.refresh(formula)
    if nueva:
        franja = cita.disponibilidad
        enviar_por_canal(
            cita.paciente, cita.canal_recordatorio,
            f"SaludYA: ya está su fórmula de la cita de {franja.especialista.especialidad.nombre} del "
            f"{fecha_legible(franja.fecha)}. Véala y sepa dónde reclamar sus medicamentos en "
            f"{settings.frontend_url}/mis-citas",
        )
    return formula


def farmacias_para(db: Session, sede_id: uuid.UUID | None) -> list[Farmacia]:
    """Las abiertas: primero las cercanas a la sede donde lo atendieron, de la más cercana a la más lejana."""
    farmacias = db.query(Farmacia).filter(Farmacia.activa.is_(True)).all()
    return sorted(farmacias, key=lambda f: (f.sede_id != sede_id, f.distancia_km))


def datos(formula: FormulaMedica) -> dict:
    franja = formula.cita.disponibilidad
    return {
        "codigo": formula.codigo,
        "vence_en": formula.vence_en,
        "cubierta_por_eps": formula.cubierta_por_eps,
        "diagnostico": formula.diagnostico,
        "nota": formula.nota,
        "medicamentos": json.loads(formula.medicamentos),
        "recomendaciones": json.loads(formula.recomendaciones),
        "registrada_en": formula.registrada_en,
        "registrada_por": formula.registrada_por,
        "especialidad": franja.especialista.especialidad.nombre,
        "especialista": franja.especialista.nombre,
        "fecha": franja.fecha,
        "hora": franja.hora,
        "sede": franja.sede.nombre,
    }


def de_mi_cita(db: Session, paciente_id: uuid.UUID, cita_id: uuid.UUID) -> dict:
    cita = citas_service.obtener_del_paciente(db, paciente_id, cita_id)
    if cita.formula is None:
        raise CitaNoEncontradaError("Esta cita no tiene fórmula médica.")
    return {
        **datos(cita.formula),
        "qr": qr(cita.formula),
        "farmacias": [
            {
                "id": f.id,
                "nombre": f.nombre,
                "barrio": f.barrio,
                "ciudad": f.ciudad,
                "direccion": f.direccion,
                "aliada": f.aliada,
                "distancia_km": f.distancia_km,
                "sede": f.sede.nombre if f.sede else None,
            }
            for f in farmacias_para(db, cita.disponibilidad.sede_id)
        ],
    }


# --- IPS simulada: fórmulas de ejemplo por especialidad ---
# Casos comunes y tratamientos de uso frecuente: es una simulación para la
# demostración, no una recomendación médica.
EJEMPLOS = {
    "Médico general": [{
        "diagnostico": "Faringitis aguda",
        "nota": "Dolor de garganta y fiebre desde hace dos días, sin dificultad para respirar. "
                "Tratamiento por 7 días. Si la fiebre sigue después de 3 días, volver a consulta.",
        "medicamentos": [
            {"nombre": "Amoxicilina", "dosis": "500 mg", "indicacion": "1 cápsula cada 8 horas",
             "duracion": "Durante 7 días", "cantidad": "21 cápsulas"},
            {"nombre": "Acetaminofén", "dosis": "500 mg", "indicacion": "1 tableta cada 6 horas si tiene fiebre o dolor",
             "duracion": "Máximo 4 al día", "cantidad": "20 tabletas"},
        ],
        "recomendaciones": ["Tome mucha agua y bebidas tibias.", "Descanse y evite cambios bruscos de temperatura.",
                            "Termine el antibiótico aunque se sienta mejor."],
    }],
    "Cardiología": [{
        "diagnostico": "Hipertensión arterial en control",
        "nota": "Presión en metas con el tratamiento actual. Se continúa igual y control en 3 meses.",
        "medicamentos": [
            {"nombre": "Losartán", "dosis": "50 mg", "indicacion": "1 tableta cada 12 horas",
             "duracion": "Durante 30 días", "cantidad": "60 tabletas"},
        ],
        "recomendaciones": ["Coma con poca sal.", "Camine 30 minutos al día.",
                            "Tómese la presión en casa y anótela para la próxima cita."],
    }],
    "Dermatología": [{
        "diagnostico": "Dermatitis de contacto",
        "nota": "Brote en el antebrazo después de cambiar de jabón. Se suspende el producto y se trata por una semana.",
        "medicamentos": [
            {"nombre": "Hidrocortisona crema", "dosis": "1 %", "indicacion": "Aplicar una capa delgada 2 veces al día",
             "duracion": "Durante 7 días", "cantidad": "1 tubo"},
            {"nombre": "Loratadina", "dosis": "10 mg", "indicacion": "1 tableta al día si hay picazón",
             "duracion": "Durante 7 días", "cantidad": "7 tabletas"},
        ],
        "recomendaciones": ["No use el jabón que le causó el brote.", "No se rasque la zona.",
                            "Use ropa de algodón."],
    }],
    "Pediatría": [{
        "diagnostico": "Resfriado común",
        "nota": "Congestión nasal y fiebre baja. Buen estado general. Manejo en casa.",
        "medicamentos": [
            {"nombre": "Acetaminofén jarabe", "dosis": "150 mg / 5 ml", "indicacion": "5 ml cada 6 horas si tiene fiebre",
             "duracion": "Durante 3 días", "cantidad": "1 frasco"},
            {"nombre": "Suero fisiológico nasal", "dosis": "0,9 %", "indicacion": "2 gotas en cada fosa nasal 3 veces al día",
             "duracion": "Durante 5 días", "cantidad": "1 frasco"},
        ],
        "recomendaciones": ["Dele líquidos con frecuencia.", "Si tiene dificultad para respirar, vaya a urgencias."],
    }],
    "Ortopedia": [{
        "diagnostico": "Esguince de tobillo leve",
        "nota": "Torcedura hace un día, sin fractura. Inmovilización suave y control si no mejora en 2 semanas.",
        "medicamentos": [
            {"nombre": "Naproxeno", "dosis": "250 mg", "indicacion": "1 tableta cada 12 horas, después de comer",
             "duracion": "Durante 5 días", "cantidad": "10 tabletas"},
        ],
        "recomendaciones": ["Ponga hielo 20 minutos, 3 veces al día.", "Mantenga el pie en alto.",
                            "No haga deporte por 2 semanas."],
    }],
}


def simular_desde_ips(db: Session, ips: Actor, rng: random.Random | None = None, dias: int = VIGENCIA_DIAS) -> int:
    """
    La IPS (actor `ips`) manda la fórmula de las citas atendidas en los últimos
    `dias` que todavía no la tienen (una de ejemplo según la especialidad).
    Devuelve cuántas llegaron.
    """
    rng = rng or random.Random()
    desde = hoy_en_colombia() - timedelta(days=dias)
    citas = (
        db.query(Cita)
        .outerjoin(FormulaMedica, FormulaMedica.cita_id == Cita.id)
        .filter(Cita.estado == EstadoCita.ATENDIDA, FormulaMedica.id.is_(None))
        .all()
    )
    recibidas = 0
    for cita in citas:
        franja = cita.disponibilidad
        ejemplos = EJEMPLOS.get(franja.especialista.especialidad.nombre)
        if franja.fecha < desde or not ejemplos:
            continue
        ejemplo = rng.choice(ejemplos)
        registrar(db, ips, cita.id, ejemplo["diagnostico"], ejemplo["nota"], ejemplo["medicamentos"],
                  ejemplo["recomendaciones"])
        recibidas += 1
    return recibidas
