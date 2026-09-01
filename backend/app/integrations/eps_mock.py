"""
Simulación (mock) de consulta de afiliación a una EPS — HU-08.

IMPORTANTE: esto NO es una integración real. La arquitectura del
proyecto no define ninguna API real de ninguna EPS (ver Sección 14 de
la auditoría del Sprint 1) — es un mock académico para poder
demostrar el comportamiento completo de la historia de usuario.

Simula lo que respondería un servicio externo real: dado un número de
documento, dice si tiene una afiliación activa. La lista de abajo es
arbitraria, solo sirve para poder demostrar ambos casos (encontrado /
no encontrado) en la sustentación. Se puede editar libremente.

Cuando exista una integración real con alguna EPS, esta función es el
único lugar que hay que reemplazar — el resto del código (servicio,
router) no debería cambiar.
"""

DOCUMENTOS_CON_AFILIACION_SIMULADA_ACTIVA = {
    "1038456210",
    "1020304050",
    "1122334455",
}


def consultar_afiliacion_eps(numero_documento: str) -> bool:
    """
    Simula la consulta de afiliación de un paciente a su EPS.

    Devuelve True si el documento tiene afiliación activa (simulada),
    False si no se encuentra ninguna afiliación.
    """
    return numero_documento in DOCUMENTOS_CON_AFILIACION_SIMULADA_ACTIVA
