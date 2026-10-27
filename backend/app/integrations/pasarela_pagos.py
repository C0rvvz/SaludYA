"""
Pasarela de pagos SIMULADA, con el mismo flujo de Wompi (no cobra nada).

- tokenizar_tarjeta(): como POST /v1/tokens/cards de Wompi. Revisa la
  tarjeta y la cambia por un token de un solo uso que vive unos minutos en
  memoria. Los datos de la tarjeta nunca se guardan ni salen de aquí.
  En la simulación solo sirven las tarjetas de prueba de Wompi:
  4242 4242 4242 4242 (se aprueba) y 4111 1111 1111 1111 (se rechaza);
  así nadie escribe una tarjeta real.
- cobrar_con_tarjeta(): usa el token; responde de una vez.
- iniciar_pse(): como una transacción PSE de Wompi: queda pendiente hasta
  que la persona responda en la página de su banco (aquí, una página de
  prueba de SaludYA).
- BANCOS_PSE: los bancos de la lista de PSE.

Para conectar Wompi de verdad se cambiarían estas funciones por llamadas
a su API (con las llaves de la cuenta), sin tocar pagos_service.
"""

import secrets
import threading
import time
from dataclasses import dataclass

BANCOS_PSE = [
    "Bancolombia", "Banco de Bogotá", "Davivienda", "BBVA Colombia", "Banco de Occidente",
    "Banco Popular", "Banco AV Villas", "Banco Caja Social", "Banco Agrario", "Scotiabank Colpatria",
    "Banco Falabella", "Nequi", "Daviplata", "Bancamía",
]
TARJETAS_DE_PRUEBA = {
    "4242424242424242": ("VISA", True),  # aprobada
    "4111111111111111": ("VISA", False),  # rechazada
}
VIDA_TOKEN_SEGUNDOS = 600
CUOTAS_MAXIMAS = 36


class TarjetaInvalidaError(Exception):
    """Datos de tarjeta que no sirven (o no es una tarjeta de prueba)."""


@dataclass
class _Token:
    marca: str
    ultimos4: str
    aprobada: bool
    vence_en: float


_tokens: dict[str, _Token] = {}
_candado = threading.Lock()


def _luhn(numero: str) -> bool:
    total = 0
    for i, d in enumerate(reversed(numero)):
        n = int(d)
        if i % 2 == 1:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


def tokenizar_tarjeta(numero: str, cvc: str, mes: int, anio: int, titular: str, hoy: tuple[int, int]) -> dict:
    """Devuelve {token, marca, ultimos4}. `hoy`: (año, mes) actuales, para saber si ya venció."""
    numero = "".join(numero.split())
    if not numero.isdigit() or not 13 <= len(numero) <= 19 or not _luhn(numero):
        raise TarjetaInvalidaError("El número de la tarjeta no es válido. Revíselo.")
    if not (cvc.isdigit() and len(cvc) in (3, 4)):
        raise TarjetaInvalidaError("El código de atrás (CVC) tiene 3 o 4 números.")
    if not 1 <= mes <= 12 or (anio, mes) < hoy:
        raise TarjetaInvalidaError("La fecha de vencimiento no es válida o la tarjeta ya venció.")
    if len(" ".join(titular.split())) < 3:
        raise TarjetaInvalidaError("Escriba el nombre como aparece en la tarjeta.")
    if numero not in TARJETAS_DE_PRUEBA:
        raise TarjetaInvalidaError(
            "Este es un pago de prueba: use la tarjeta 4242 4242 4242 4242 (se aprueba) "
            "o la 4111 1111 1111 1111 (se rechaza)."
        )
    marca, aprobada = TARJETAS_DE_PRUEBA[numero]
    token = f"tok_prueba_{secrets.token_hex(12)}"
    with _candado:
        ahora = time.monotonic()
        for viejo in [t for t, d in _tokens.items() if d.vence_en < ahora]:
            del _tokens[viejo]
        _tokens[token] = _Token(marca, numero[-4:], aprobada, ahora + VIDA_TOKEN_SEGUNDOS)
    return {"token": token, "marca": marca, "ultimos4": numero[-4:]}


@dataclass
class Resultado:
    transaccion: str
    aprobado: bool | None  # None: pendiente (PSE, esperando al banco)
    motivo: str | None = None
    detalle: str = ""


def cobrar_con_tarjeta(token: str, cuotas: int) -> Resultado:
    with _candado:
        datos = _tokens.pop(token, None)  # un solo uso
    if datos is None or datos.vence_en < time.monotonic():
        raise TarjetaInvalidaError("Los datos de la tarjeta vencieron. Escríbalos de nuevo.")
    if not 1 <= cuotas <= CUOTAS_MAXIMAS:
        raise TarjetaInvalidaError(f"Elija de 1 a {CUOTAS_MAXIMAS} cuotas.")
    detalle = f"{datos.marca} •••• {datos.ultimos4} · {cuotas} {'cuota' if cuotas == 1 else 'cuotas'}"
    return Resultado(
        transaccion=f"txn_prueba_{secrets.token_hex(8)}",
        aprobado=datos.aprobada,
        motivo=None if datos.aprobada else "El banco no aprobó el pago (fondos insuficientes).",
        detalle=detalle,
    )


def iniciar_pse(banco: str) -> Resultado:
    if banco not in BANCOS_PSE:
        raise TarjetaInvalidaError("Elija su banco de la lista.")
    return Resultado(transaccion=f"txn_prueba_{secrets.token_hex(8)}", aprobado=None, detalle=f"PSE · {banco}")
