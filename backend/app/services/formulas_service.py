"""
Fórmula médica de una cita atendida y dónde reclamarla.

- registrar(): el personal con acceso a la historia clínica (médico o
  Coordinación médica; ver historia_clinica_service) escribe o corrige lo
  que formuló el médico, con el código CIE-10 del diagnóstico. Solo para
  citas atendidas. La primera vez se le avisa al paciente por el canal de
  su cita. Al corregirla, lo que ya se entregó sigue entregado.
- de_mi_cita(): lo que ve el paciente en Mis citas: la fórmula, el QR de su
  código y las farmacias donde reclamar (las cercanas a su sede primero).
- simular_desde_ips(): la IPS (simulada) manda la fórmula de las citas
  atendidas que todavía no la tienen, como si llegara del sistema del médico.
- simular_entregas(): las farmacias aliadas (simuladas) entregan algunos
  medicamentos de las fórmulas vigentes, con el código del paciente.
- estado_entrega(): entregada, parcial, por reclamar, vencida o sin
  medicamentos.
- reenviar_codigo(): le vuelve a mandar al paciente el código de su fórmula.

El código del QR va firmado (HMAC): una farmacia puede comprobar que lo
generó SaludYA y que no lo cambiaron.

SUPUESTO: la fórmula vale 30 días (VIGENCIA_DIAS) desde que se registra.
"""

import hashlib
import hmac
import json
import random
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

import segno
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.notificaciones import enviar_por_canal
from app.models.cita import Cita, EstadoCita
from app.models.formula_medica import Farmacia, FormulaMedica
from app.models.auditoria import TipoActor
from app.services import auditoria_service, citas_service
from app.services.auditoria_service import Actor
from app.services.exceptions import CitaNoEncontradaError, FormulaInvalidaError
from app.utils.tiempo import fecha_legible, hoy_en_colombia

VIGENCIA_DIAS = 30
# CIE-10: una letra, dos números y, opcional, un punto con 1 a 4 caracteres ("J02.9", "I10", "S93.40").
FORMATO_CIE10 = re.compile(r"^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$")

ESTADOS_ENTREGA = {
    "entregada": "Fórmula entregada",
    "parcial": "Entrega parcial",
    "por_reclamar": "Por reclamar",
    "vencida": "Vencida sin reclamar",
    "sin_medicamentos": "Sin medicamentos",
}


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


def _cie10(codigo: str | None) -> str:
    codigo = "".join((codigo or "").split()).upper()
    if not codigo:
        raise FormulaInvalidaError("Escriba el código CIE-10 del diagnóstico (p. ej. J02.9).")
    if not FORMATO_CIE10.match(codigo):
        raise FormulaInvalidaError(f"«{codigo}» no es un código CIE-10: es una letra y números, como J02.9 o I10.")
    return codigo


def medicamentos_de(formula: FormulaMedica) -> list[dict]:
    """Los medicamentos, cada uno con "entregado" (True si la farmacia ya lo entregó)."""
    return [{**m, "entregado": bool(m.get("entregado"))} for m in json.loads(formula.medicamentos)]


def registrar(
    db: Session,
    actor: Actor,
    cita_id: uuid.UUID,
    diagnostico: str,
    nota: str | None,
    medicamentos: list[dict],
    recomendaciones: list[str],
    cubierta_por_eps: bool = True,
    cie10: str | None = None,
) -> FormulaMedica:
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise CitaNoEncontradaError("No existe esa cita.")
    if cita.estado != EstadoCita.ATENDIDA:
        raise FormulaInvalidaError("Solo se registra la fórmula de una cita atendida.")
    diagnostico = " ".join(diagnostico.split())
    if not diagnostico:
        raise FormulaInvalidaError("Escriba el diagnóstico.")
    cie10 = _cie10(cie10)
    medicamentos = _limpiar_medicamentos(medicamentos)
    recomendaciones = [r.strip() for r in recomendaciones if r and r.strip()]
    if not medicamentos and not recomendaciones:
        raise FormulaInvalidaError("Agregue al menos un medicamento o una recomendación.")

    formula = cita.formula
    nueva = formula is None
    if nueva:
        formula = FormulaMedica(cita=cita, codigo=_codigo_nuevo(db))
        db.add(formula)
    else:
        # Lo que la farmacia ya entregó sigue entregado (mismo medicamento, por nombre).
        entregados = {m["nombre"].lower() for m in medicamentos_de(formula) if m["entregado"]}
        for m in medicamentos:
            if m["nombre"].lower() in entregados:
                m["entregado"] = True
    formula.diagnostico = diagnostico
    formula.diagnostico_cie10 = cie10
    formula.nota = (nota or "").strip() or None
    formula.medicamentos = json.dumps(medicamentos, ensure_ascii=False)
    formula.recomendaciones = json.dumps(recomendaciones, ensure_ascii=False)
    # Un paciente particular (sin EPS) paga sus medicamentos: no pueden estar "cubiertos por la EPS".
    formula.cubierta_por_eps = cubierta_por_eps and cita.paciente.eps_id is not None
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


def estado_entrega(formula: FormulaMedica) -> str:
    medicamentos = medicamentos_de(formula)
    entregados = sum(m["entregado"] for m in medicamentos)
    if not medicamentos:
        return "sin_medicamentos"
    if entregados == len(medicamentos):
        return "entregada"
    if entregados:
        return "parcial"
    return "vencida" if formula.vence_en < hoy_en_colombia() else "por_reclamar"


def datos(formula: FormulaMedica) -> dict:
    franja = formula.cita.disponibilidad
    medicamentos = medicamentos_de(formula)
    estado = estado_entrega(formula)
    farmacia = formula.farmacia_entrega
    return {
        "codigo": formula.codigo,
        "vence_en": formula.vence_en,
        "vigente": formula.vence_en >= hoy_en_colombia(),
        "cubierta_por_eps": formula.cubierta_por_eps,
        "diagnostico": formula.diagnostico,
        "cie10": formula.diagnostico_cie10,
        "nota": formula.nota,
        "medicamentos": medicamentos,
        "entregados": sum(m["entregado"] for m in medicamentos),
        "estado_entrega": estado,
        "estado_entrega_texto": ESTADOS_ENTREGA[estado],
        "farmacia_entrega": f"{farmacia.nombre}{' · aliada' if farmacia.aliada else ''}" if farmacia else None,
        "ultima_entrega_en": formula.ultima_entrega_en,
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
        "particular": cita.paciente.eps_id is None,
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
        "cie10": "J02.9",
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
        "cie10": "I10",
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
        "cie10": "L25.9",
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
        "cie10": "J00",
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
        "cie10": "S93.4",
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
                  ejemplo["recomendaciones"], cie10=ejemplo["cie10"])
        recibidas += 1
    return recibidas


def entregar(db: Session, formula: FormulaMedica, farmacia: Farmacia, nombres: list[str]) -> None:
    """
    La farmacia entrega esos medicamentos con el código del paciente. Queda
    en la auditoría con el nombre de la farmacia ("Quién ha consultado esta
    fórmula"), sin decir cuáles (es dato médico).
    """
    medicamentos = medicamentos_de(formula)
    for m in medicamentos:
        if m["nombre"] in nombres:
            m["entregado"] = True
    formula.medicamentos = json.dumps(medicamentos, ensure_ascii=False)
    formula.farmacia_entrega = farmacia
    formula.ultima_entrega_en = datetime.now(timezone.utc)
    n = len(nombres)
    auditoria_service.registrar(
        db, Actor(TipoActor.SISTEMA, None, f"{farmacia.nombre} (farmacia)"), "entrega_farmacia",
        f"Entregó {n} medicamento{'' if n == 1 else 's'} con el código {formula.codigo}",
        cita=formula.cita,
    )


def simular_entregas(db: Session, rng: random.Random | None = None) -> int:
    """
    Las farmacias aliadas (simuladas) entregan los medicamentos de algunas
    fórmulas vigentes que tienen algo por reclamar: a veces todos, a veces
    solo una parte. Devuelve cuántas entregas hubo.
    """
    rng = rng or random.Random()
    aliadas = db.query(Farmacia).filter(Farmacia.aliada.is_(True), Farmacia.activa.is_(True)).all()
    if not aliadas:
        return 0
    entregas = 0
    for formula in db.query(FormulaMedica).filter(FormulaMedica.vence_en >= hoy_en_colombia()).all():
        pendientes = [m["nombre"] for m in medicamentos_de(formula) if not m["entregado"]]
        if not pendientes or rng.random() < 0.4:
            continue
        sede_id = formula.cita.disponibilidad.sede_id
        cercanas = [f for f in aliadas if f.sede_id == sede_id] or aliadas
        cuantos = len(pendientes) if len(pendientes) == 1 or rng.random() < 0.6 else rng.randint(1, len(pendientes) - 1)
        entregar(db, formula, rng.choice(cercanas), pendientes[:cuantos])
        entregas += 1
    return entregas


def reenviar_codigo(db: Session, actor: Actor, cita: Cita) -> str:
    """Le vuelve a mandar al paciente el código de su fórmula (por el canal de su cita)."""
    formula = cita.formula
    if formula is None:
        raise FormulaInvalidaError("Esta cita todavía no tiene fórmula médica.")
    if formula.vence_en < hoy_en_colombia():
        raise FormulaInvalidaError("La fórmula ya venció: el código no sirve para reclamar.")
    enviado = enviar_por_canal(
        cita.paciente, cita.canal_recordatorio,
        f"SaludYA: el código de su fórmula es {formula.codigo} y vale hasta el {fecha_legible(formula.vence_en)}. "
        f"Muéstrelo (o el QR) en una farmacia aliada. Véalo en {settings.frontend_url}/mis-citas",
    )
    if not enviado:
        raise FormulaInvalidaError("No pudimos enviar el código. Intente de nuevo en unos minutos.")
    auditoria_service.registrar(db, actor, "reenviar_codigo_formula", "Reenvió al paciente el código de la fórmula",
                                cita=cita)
    db.commit()
    return cita.canal_recordatorio.value
