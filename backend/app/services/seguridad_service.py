"""
Seguridad — panel "Seguridad" del administrador (tipo SIEM / SOC, con
controles de Zero Trust).

- registrar(): guarda un evento de seguridad (models/evento_seguridad.py).
  Lo llaman el ingreso del paciente y del personal, la sesión
  (sesion_service), los límites de intentos, la verificación "No soy un
  robot" y la verificación de cada token y permiso (core/dependencies).
- panel(): lo que ve el administrador en el periodo elegido: cifras,
  alertas, sesiones activas, eventos y los controles que están activos.
- cerrar_sesion(): el administrador cierra a distancia una sesión que no
  reconoce (Zero Trust: el token deja de servir de inmediato).

Alertas: se calculan al consultar con estas reglas, sobre el periodo:
  - Posible fuerza bruta: 5 o más ingresos fallidos desde una misma
    conexión (IP) en 15 minutos.
  - Varias cuentas desde una conexión: fallos con 3 o más cuentas o
    documentos distintos desde la misma IP (relleno de credenciales o
    alguien averiguando qué documentos están registrados).
  - Cuenta bloqueada por intentos fallidos (personal) o código bloqueado (paciente).
  - Intentos de usar funciones que el rol no permite (3 o más: alta).
  - Token inválido o alterado.
  - Ingreso del personal fuera del horario habitual (entre 10 p. m. y 6 a. m.).
  - Ingreso desde otra conexión mientras la sesión anterior seguía abierta.
  - Se otorgó el rol de Administrador (de la auditoría de cuentas).
  - Conexiones frenadas por el límite de intentos.
  - Intentos automatizados: peticiones de ingreso sin «No soy un robot».

SUPUESTO: las reglas usan los últimos 5.000 eventos del periodo; para un
volumen mayor habría que llevarlos a un SIEM externo (p. ej. Wazuh).
"""

import logging
import threading
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from app.core import cifrado
from app.core.config import settings
from app.core.permisos import NOMBRE_ROL
from app.integrations import verificacion_humana
from app.models.auditoria import RegistroAuditoria
from app.models.evento_seguridad import EventoSeguridad
from app.models.paciente import Paciente
from app.models.personal import Personal
from app.models.sesion import MotivoCierre, Sesion
from app.repositories import evento_seguridad_repository
from app.services.exceptions import SesionNoCerrableError
from app.utils.tiempo import ZONA_COLOMBIA

logger = logging.getLogger("saludya.seguridad")

INFO, MEDIA, ALTA = "info", "media", "alta"

# Lo que ve el administrador de cada tipo de evento.
TIPOS = {
    "ingreso_exitoso": "Ingreso exitoso",
    "ingreso_fallido": "Ingreso fallido",
    "cuenta_bloqueada": "Cuenta bloqueada por intentos fallidos",
    "ingreso_bloqueado": "Intento con la cuenta bloqueada",
    "documento_no_registrado": "Documento no registrado",
    "codigo_incorrecto": "Código de verificación incorrecto",
    "codigo_bloqueado": "Código bloqueado por intentos",
    "acceso_denegado": "Intento sin permiso",
    "token_invalido": "Token inválido o alterado",
    "limite_intentos": "Límite de intentos alcanzado",
    "verificacion_fallida": "«No soy un robot» sin verificar",
    "sesion_reemplazada": "Sesión reemplazada por otra",
    "sesion_cerrada_admin": "Sesión cerrada por un administrador",
}

# Los que no confirman que la persona sea quien dice ser.
FALLOS_DE_INGRESO = {"ingreso_fallido", "ingreso_bloqueado", "codigo_incorrecto", "documento_no_registrado"}

# Los que un ataque puede repetir miles de veces: uno por conexión y tipo cada tanto.
_AGRUPAR_CADA = 300  # segundos
_ultimos: dict[tuple[str, str], float] = {}
_lock = threading.Lock()


def reiniciar() -> None:
    """Para las pruebas: olvida los eventos agrupados."""
    with _lock:
        _ultimos.clear()


def _ip(request: Request | None) -> str | None:
    # Igual que limite_intentos.ip_de: no se confía en X-Forwarded-For.
    return request.client.host if request is not None and request.client else None


def nombre_personal(personal: Personal) -> str:
    return f"{personal.nombre} ({NOMBRE_ROL[personal.rol]})"


def documento_enmascarado(numero_documento: str | None) -> str | None:
    """Del documento solo se guardan los últimos 4 dígitos."""
    if not numero_documento:
        return None
    return f"Documento terminado en {numero_documento.strip()[-4:]}"


def quien_es(db: Session, tipo: str, sujeto_id: uuid.UUID) -> tuple[str, str | None]:
    """Nombre e identificador (correo, o documento enmascarado) de una persona del personal o un paciente."""
    if tipo == "personal":
        p = db.get(Personal, sujeto_id)
        return (nombre_personal(p), p.correo) if p else ("Cuenta eliminada", None)
    p = db.get(Paciente, sujeto_id)
    return (p.nombre, documento_enmascarado(p.numero_documento)) if p else ("Paciente", None)


def registrar(
    db: Session,
    tipo: str,
    severidad: str,
    ambito: str,
    descripcion: str,
    *,
    request: Request | None = None,
    ip: str | None = None,
    sujeto_id: uuid.UUID | None = None,
    sujeto_nombre: str | None = None,
    identificador: str | None = None,
    dispositivo: str | None = None,
    detalle: str | None = None,
    agrupar: bool = False,
) -> None:
    """
    Guarda el evento con su propio commit, aunque la petición termine en
    error (un ingreso fallido debe quedar). Nunca interrumpe la petición:
    si no se puede guardar, queda en el log.
    """
    ip = ip or _ip(request)
    if agrupar:
        clave = (tipo, ip or "")
        with _lock:
            ultimo = _ultimos.get(clave)
            if ultimo is not None and time.monotonic() - ultimo < _AGRUPAR_CADA:
                return
            _ultimos[clave] = time.monotonic()
    if dispositivo is None and request is not None:
        dispositivo = request.headers.get("user-agent")
    try:
        db.add(
            EventoSeguridad(
                tipo=tipo,
                severidad=severidad,
                ambito=ambito,
                sujeto_id=sujeto_id,
                sujeto_nombre=(sujeto_nombre or "")[:150] or None,
                identificador=(identificador or "")[:150] or None,
                ip=ip,
                dispositivo=(dispositivo or "")[:200] or None,
                descripcion=descripcion[:300],
                detalle=detalle,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 — registrar nunca debe tumbar la petición
        db.rollback()
        logger.exception("No se pudo guardar el evento de seguridad %s", tipo)


# --- Panel ---


def dispositivo_legible(agente: str | None) -> str | None:
    """"Chrome en Windows", a partir del User-Agent del navegador."""
    if not agente:
        return None
    navegador = next(
        (nombre for clave, nombre in (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"),
                                      ("Chrome/", "Chrome"), ("Safari/", "Safari")) if clave in agente),
        "Otro navegador",
    )
    sistema = next(
        (nombre for clave, nombre in (("Android", "Android"), ("iPhone", "iPhone"), ("iPad", "iPad"),
                                      ("Windows", "Windows"), ("Mac OS", "Mac"), ("Linux", "Linux")) if clave in agente),
        None,
    )
    return f"{navegador} en {sistema}" if sistema else navegador


def _evento_out(e: EventoSeguridad) -> dict:
    return {
        "id": e.id,
        "fecha": e.fecha,
        "tipo": e.tipo,
        "tipo_texto": TIPOS.get(e.tipo, e.tipo),
        "severidad": e.severidad,
        "ambito": e.ambito,
        "sujeto_nombre": e.sujeto_nombre,
        "identificador": e.identificador,
        "ip": e.ip,
        "dispositivo": dispositivo_legible(e.dispositivo),
        "descripcion": e.descripcion,
        "detalle": e.detalle,
    }


def _alerta(clave, severidad, titulo, descripcion, recomendacion, eventos_o_fechas, ip=None, sujeto=None) -> dict:
    fechas = [x if isinstance(x, datetime) else x.fecha for x in eventos_o_fechas]
    return {
        "clave": clave,
        "severidad": severidad,
        "titulo": titulo,
        "descripcion": descripcion,
        "recomendacion": recomendacion,
        "cantidad": len(fechas),
        "ultima_vez": max(fechas),
        "ip": ip,
        "sujeto": sujeto,
    }


def _max_en_ventana(fechas: list[datetime], ventana: timedelta) -> int:
    """Cuántos caen, como máximo, dentro de una misma ventana de tiempo."""
    fechas = sorted(fechas)
    mayor, inicio = 0, 0
    for fin, fecha in enumerate(fechas):
        while fecha - fechas[inicio] > ventana:
            inicio += 1
        mayor = max(mayor, fin - inicio + 1)
    return mayor


def _quien(e: EventoSeguridad) -> str | None:
    return " · ".join(x for x in (e.sujeto_nombre, e.identificador) if x) or None


def _alertas(eventos: list[EventoSeguridad], cuentas: list[RegistroAuditoria]) -> list[dict]:
    alertas = []
    por_tipo: dict[str, list[EventoSeguridad]] = defaultdict(list)
    for e in eventos:
        por_tipo[e.tipo].append(e)

    # Fuerza bruta y varias cuentas desde una misma conexión
    fallos_por_ip: dict[str, list[EventoSeguridad]] = defaultdict(list)
    for e in eventos:
        if e.tipo in FALLOS_DE_INGRESO and e.ip:
            fallos_por_ip[e.ip].append(e)
    for ip, fallos in fallos_por_ip.items():
        en_15 = _max_en_ventana([f.fecha for f in fallos], timedelta(minutes=15))
        if en_15 >= 5:
            alertas.append(_alerta(
                "fuerza_bruta", ALTA, f"Posible ataque de fuerza bruta desde {ip}",
                f"{en_15} intentos fallidos de ingreso en 15 minutos desde la misma conexión.",
                "Si no reconoce esta conexión, bloquéela en el firewall. Las cuentas del personal se bloquean "
                "solas tras 5 intentos y cada conexión tiene un límite de intentos.",
                fallos, ip=ip,
            ))
        cuentas_probadas = {f.identificador for f in fallos if f.identificador}
        if len(cuentas_probadas) >= 3:
            alertas.append(_alerta(
                "varias_cuentas", ALTA, f"Se probaron {len(cuentas_probadas)} cuentas desde {ip}",
                "Ingresos fallidos con varias cuentas o documentos distintos desde la misma conexión: puede ser "
                "alguien probando contraseñas robadas o averiguando qué documentos están registrados.",
                "Revise si las cuentas afectadas reconocen esos intentos y bloquee la conexión si no es conocida.",
                fallos, ip=ip,
            ))

    # Cuentas y códigos bloqueados
    for tipo, titulo, severidad in (
        ("cuenta_bloqueada", "Cuenta del personal bloqueada", ALTA),
        ("codigo_bloqueado", "Código de ingreso de un paciente bloqueado", MEDIA),
    ):
        por_cuenta: dict[str, list[EventoSeguridad]] = defaultdict(list)
        for e in por_tipo[tipo]:
            por_cuenta[_quien(e) or "Cuenta desconocida"].append(e)
        for quien, lista in por_cuenta.items():
            alertas.append(_alerta(
                tipo, severidad, f"{titulo}: {quien}",
                "Se equivocaron varias veces seguidas al ingresar con esta cuenta y quedó bloqueada un tiempo.",
                "Confirme con la persona si fue ella. Si no, cámbiele la contraseña.",
                lista, ip=lista[0].ip, sujeto=quien,
            ))

    # Intentos sin permiso (por persona)
    por_persona: dict[str, list[EventoSeguridad]] = defaultdict(list)
    for e in por_tipo["acceso_denegado"]:
        por_persona[_quien(e) or "Desconocido"].append(e)
    for quien, lista in por_persona.items():
        varias = len(lista) >= 3
        alertas.append(_alerta(
            "acceso_denegado", ALTA if varias else MEDIA,
            f"{'Intentos repetidos' if varias else 'Intento'} de usar funciones sin permiso: {quien}",
            f"Intentó {len(lista)} {'veces' if len(lista) != 1 else 'vez'} hacer algo que su rol no permite "
            f"(por ejemplo: {lista[0].detalle or lista[0].descripcion}). El sistema lo impidió.",
            "Confirme con la persona. Si su trabajo lo necesita, cámbiele el rol; si no, revise su cuenta.",
            lista, ip=lista[0].ip, sujeto=quien,
        ))

    # Tokens alterados (por conexión)
    tokens_por_ip: dict[str, list[EventoSeguridad]] = defaultdict(list)
    for e in por_tipo["token_invalido"]:
        tokens_por_ip[e.ip or "desconocida"].append(e)
    for ip, lista in tokens_por_ip.items():
        alertas.append(_alerta(
            "token_invalido", ALTA, f"Token inválido o alterado desde {ip}",
            "Llegaron peticiones con un token que no es válido: alterado, falso o de otro tipo de cuenta "
            "(por ejemplo, el de un paciente en el panel del personal). Fueron rechazadas.",
            "Si se repite, puede ser un intento de suplantación: bloquee la conexión.",
            lista, ip=ip,
        ))

    # Ingresos del personal fuera de horario
    fuera: dict[str, list[EventoSeguridad]] = defaultdict(list)
    for e in por_tipo["ingreso_exitoso"]:
        hora = e.fecha.astimezone(ZONA_COLOMBIA).hour
        if e.ambito == "personal" and (hora >= 22 or hora < 6):
            fuera[_quien(e) or "Desconocido"].append(e)
    for quien, lista in fuera.items():
        alertas.append(_alerta(
            "fuera_de_horario", MEDIA, f"Ingreso fuera del horario habitual: {quien}",
            "Ingresó al panel del personal entre las 10:00 p. m. y las 6:00 a. m.",
            "Confirme que fue esa persona (por ejemplo, un turno de noche).",
            lista, ip=lista[0].ip, sujeto=quien,
        ))

    # Ingreso desde otra conexión con la sesión abierta
    for e in por_tipo["sesion_reemplazada"]:
        if e.severidad != INFO:
            alertas.append(_alerta(
                "otra_conexion", MEDIA, f"Ingreso desde otra conexión: {_quien(e)}",
                f"Ingresó desde {e.ip} mientras su sesión seguía abierta en otra conexión ({e.detalle}). "
                "La sesión anterior se cerró sola.",
                "Si la persona no reconoce el ingreso, cámbiele la contraseña.",
                [e], ip=e.ip, sujeto=_quien(e),
            ))

    # Se otorgó el rol de Administrador
    for r in cuentas:
        nuevo_admin = (r.accion == "cambiar_rol" and r.estado_nuevo == "Administrador") or (
            r.accion == "crear_cuenta" and r.cuenta_rol == "Administrador"
        )
        if nuevo_admin:
            alertas.append(_alerta(
                "nuevo_administrador", ALTA, f"Nuevo administrador: {r.cuenta_nombre} ({r.cuenta_correo})",
                f"{r.actor_nombre} le dio el rol de Administrador: ahora puede ver la auditoría y crear, editar o "
                "desactivar cuentas del personal.",
                "Verifique que el cambio esté autorizado.",
                [r.fecha], sujeto=r.cuenta_nombre,
            ))

    # Conexiones frenadas por el límite de intentos
    limite_por_ip: dict[str, list[EventoSeguridad]] = defaultdict(list)
    for e in por_tipo["limite_intentos"]:
        limite_por_ip[e.ip or "desconocida"].append(e)
    for ip, lista in limite_por_ip.items():
        alertas.append(_alerta(
            "limite_intentos", MEDIA, f"Conexión frenada por exceso de intentos: {ip}",
            "Esta conexión hizo demasiados intentos de ingreso seguidos y se le pidió esperar.",
            "Si se repite durante varios días, bloquee la conexión.",
            lista, ip=ip,
        ))

    # Intentos automatizados (bots): ingreso sin la verificación «No soy un robot»
    bots_por_ip: dict[str, list[EventoSeguridad]] = defaultdict(list)
    for e in por_tipo["verificacion_fallida"]:
        bots_por_ip[e.ip or "desconocida"].append(e)
    for ip, lista in bots_por_ip.items():
        alertas.append(_alerta(
            "posible_bot", MEDIA, f"Intentos automatizados desde {ip}",
            "Llegaron peticiones de ingreso sin la verificación «No soy un robot», como las de un programa "
            "automático. Fueron rechazadas antes de revisar cualquier contraseña o documento.",
            "Si se repite, bloquee la conexión.",
            lista, ip=ip,
        ))

    orden = {ALTA: 0, MEDIA: 1, INFO: 2}
    alertas.sort(key=lambda a: a["ultima_vez"], reverse=True)
    alertas.sort(key=lambda a: orden[a["severidad"]])
    return alertas


def _activas(db: Session) -> list[Sesion]:
    limite = datetime.now(timezone.utc) - timedelta(minutes=settings.sesion_inactividad_minutos)
    return (
        db.query(Sesion)
        .filter(Sesion.cerrada_en.is_(None), Sesion.ultima_actividad_en >= limite)
        .order_by(Sesion.ultima_actividad_en.desc())
        .all()
    )


def _sesion_out(db: Session, s: Sesion) -> dict:
    nombre, identificador = quien_es(db, s.tipo, s.sujeto_id)
    return {
        "id": s.id,
        "tipo": s.tipo,
        "nombre": nombre,
        "identificador": identificador,
        "ip": s.ip,
        "dispositivo": dispositivo_legible(s.dispositivo),
        "creada_en": s.creada_en,
        "ultima_actividad_en": s.ultima_actividad_en,
    }


def controles() -> list[dict]:
    """Los controles de seguridad activos, en palabras simples (para el panel)."""
    minutos = settings.sesion_inactividad_minutos
    return [
        {"nombre": "Una sola sesión por cuenta",
         "detalle": "Si alguien ingresa con la misma cuenta en otra pestaña o equipo, la sesión anterior se cierra."},
        {"nombre": f"Cierre por inactividad a los {minutos:g} minutos",
         "detalle": "La sesión se cierra sola si nadie la usa."},
        {"nombre": "Cada petición se vuelve a verificar (Zero Trust)",
         "detalle": "En cada acción se comprueban el token, la sesión del servidor y el permiso del rol."},
        {"nombre": "Mínimo privilegio por rol",
         "detalle": "Cada rol solo puede usar lo que su función necesita (ver Usuarios)."},
        {"nombre": "Bloqueo tras 5 intentos fallidos",
         "detalle": "La cuenta del personal se bloquea 15 minutos; el código del paciente, tras 3 intentos."},
        {"nombre": "Límite de intentos por conexión",
         "detalle": "Frena a quien prueba muchas cuentas o documentos desde la misma conexión."},
        {"nombre": "Verificación «No soy un robot»",
         "detalle": "Activa con Cloudflare Turnstile." if verificacion_humana.activa()
         else "En modo de desarrollo: sin clave de Turnstile no se verifica."},
        {"nombre": "Datos médicos cifrados con AES-256",
         "detalle": "Motivos y respuestas de las peticiones, observaciones, motivos de cancelación, comentarios y "
         "detalles de la auditoría. " + ("Con una llave de desarrollo: configure CLAVE_CIFRADO_DATOS."
                                          if cifrado.llave_de_desarrollo() else "La llave está fuera del código.")},
        {"nombre": "Contraseñas protegidas con scrypt",
         "detalle": "Nunca se guardan ni se muestran; tampoco en la auditoría ni en estos eventos."},
    ]


def panel(db: Session, horas: int) -> dict:
    ahora = datetime.now(timezone.utc)
    desde = ahora - timedelta(hours=horas)
    eventos = evento_seguridad_repository.desde(db, desde)
    cuentas = (
        db.query(RegistroAuditoria)
        .filter(RegistroAuditoria.cuenta_id.isnot(None), RegistroAuditoria.fecha >= desde)
        .all()
    )
    alertas = _alertas(eventos, cuentas)
    activas = _activas(db)

    def contar(tipos: set[str]) -> int:
        return sum(1 for e in eventos if e.tipo in tipos)

    return {
        "desde": desde,
        "hasta": ahora,
        "indicadores": {
            "ingresos_exitosos": contar({"ingreso_exitoso"}),
            "ingresos_fallidos": contar(FALLOS_DE_INGRESO),
            "bloqueos": contar({"cuenta_bloqueada", "codigo_bloqueado"}),
            "accesos_denegados": contar({"acceso_denegado", "token_invalido"}),
            "sesiones_activas": len(activas),
            "alertas_altas": sum(1 for a in alertas if a["severidad"] == ALTA),
        },
        "alertas": alertas,
        "sesiones_activas": [_sesion_out(db, s) for s in activas],
        "eventos": [_evento_out(e) for e in eventos[:300]],
        "controles": controles(),
    }


def cerrar_sesion(db: Session, admin: Personal, sesion_actual: Sesion, sesion_id: uuid.UUID) -> None:
    """Zero Trust: el administrador cierra una sesión que no reconoce; su token deja de servir de inmediato."""
    sesion = db.get(Sesion, sesion_id)
    if sesion is None or sesion.cerrada_en is not None:
        raise SesionNoCerrableError("Esa sesión ya no está abierta.")
    if sesion.id == sesion_actual.id:
        raise SesionNoCerrableError("Esa es su propia sesión: para salir, use «Cerrar sesión».")
    datos = _sesion_out(db, sesion)
    sesion.cerrada_en = datetime.now(timezone.utc)
    sesion.motivo_cierre = MotivoCierre.CERRADA_POR_ADMIN.value
    db.commit()
    registrar(
        db, "sesion_cerrada_admin", INFO, sesion.tipo,
        f"{nombre_personal(admin)} cerró la sesión a distancia",
        ip=sesion.ip, sujeto_id=sesion.sujeto_id, sujeto_nombre=datos["nombre"], identificador=datos["identificador"],
        detalle=f"Cerrada por {admin.nombre} ({admin.correo})",
    )
