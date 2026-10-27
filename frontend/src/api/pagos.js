import { apiFetch } from "./client";

// Pago en línea de una cita atendida. Es una SIMULACIÓN del proceso de
// Wompi: no se cobra dinero real (ver backend/app/integrations/pasarela_pagos.py).

// Paso "Revisar": qué se paga, cuánto y los bancos de PSE.
export function resumenDelPago(citaId) {
  return apiFetch(`/citas/${citaId}/pago`, { auth: true });
}

// Como en Wompi, la tarjeta se cambia primero por un token de un solo uso:
// sus datos no se guardan en ninguna parte.
export function tokenizarTarjeta({ numero, cvc, mes, anio, titular }) {
  return apiFetch("/pagos/tarjetas/token", {
    method: "POST",
    auth: true,
    body: { numero, cvc, mes: Number(mes), anio: Number(anio), titular },
  });
}

// { metodo: "tarjeta", token, cuotas } o { metodo: "pse", banco, tipo_persona, correo }
export function pagarCita(citaId, datos) {
  return apiFetch(`/citas/${citaId}/pagos`, { method: "POST", auth: true, body: datos });
}

export function obtenerPago(referencia) {
  return apiFetch(`/pagos/${referencia}`, { auth: true });
}

// PSE: lo que la persona responde en la página (de prueba) de su banco.
export function responderEnElBanco(referencia, autoriza) {
  return apiFetch(`/pagos/${referencia}/banco`, { method: "POST", auth: true, body: { autoriza } });
}

export function enviarComprobantePago(referencia, canal) {
  return apiFetch(`/pagos/${referencia}/comprobante`, { method: "POST", auth: true, body: { canal } });
}
