/**
 * La sesión en el navegador — RNF-17 (sesión única) y RNF-24 (cierre a los
 * 2 minutos de inactividad). El servidor es el que manda (ver
 * backend/app/services/sesion_service.py); aquí se acompaña:
 *
 * - El token se guarda en sessionStorage, no en localStorage: es solo de
 *   ESTA pestaña, otra pestaña no lo ve y se borra al cerrarla. Para usar
 *   SaludYA en otra pestaña hay que ingresar de nuevo, y eso cierra la
 *   sesión anterior en el servidor.
 * - Si dos pestañas quedan con la misma sesión (p. ej. "Duplicar pestaña"),
 *   la más nueva lo anuncia y la anterior se cierra (BroadcastChannel).
 * - Cada petición con sesión cuenta como actividad: el reloj de inactividad
 *   de la pantalla va con el del servidor.
 */

export const TOKEN_PACIENTE = "saludya_token";
export const TOKEN_PERSONAL = "saludya_personal_token";
const CLAVES = { paciente: TOKEN_PACIENTE, personal: TOKEN_PERSONAL };

export function leerToken(tipo) {
  return sessionStorage.getItem(CLAVES[tipo]);
}

export function guardarToken(tipo, token) {
  sessionStorage.setItem(CLAVES[tipo], token);
}

export function borrarToken(tipo) {
  sessionStorage.removeItem(CLAVES[tipo]);
}

// --- Por qué se cerró la sesión: lo muestra la pantalla de ingreso ---
const claveMotivo = (tipo) => `saludya_motivo_cierre_${tipo}`;

export function guardarMotivoCierre(tipo, mensaje) {
  sessionStorage.setItem(claveMotivo(tipo), mensaje);
}

export function leerMotivoCierre(tipo) {
  return sessionStorage.getItem(claveMotivo(tipo));
}

export function borrarMotivoCierre(tipo) {
  sessionStorage.removeItem(claveMotivo(tipo));
}

// --- Actividad: la hora de la última petición con sesión que respondió el servidor ---
const ultimaActividad = { paciente: 0, personal: 0 };

export function marcarActividad(tipo) {
  ultimaActividad[tipo] = Date.now();
}

export function ultimaActividadDe(tipo) {
  return ultimaActividad[tipo];
}

// --- El servidor rechazó la sesión (401) en medio de una petición ---
export const EVENTO_SESION_CERRADA = "saludya:sesion-cerrada";

export function avisarSesionCerrada(tipo, mensaje) {
  window.dispatchEvent(new CustomEvent(EVENTO_SESION_CERRADA, { detail: { tipo, mensaje } }));
}

// --- Una sola pestaña con la sesión ---
const ID_PESTANA = crypto.randomUUID();
let canal = null;

function canalDeSesion() {
  if (typeof BroadcastChannel === "undefined") return null;
  canal ??= new BroadcastChannel("saludya-sesion");
  return canal;
}

/** Avisa a las otras pestañas de este navegador que aquí está la sesión de `tipo`. */
export function anunciarSesion(tipo) {
  canalDeSesion()?.postMessage({ tipo, pestana: ID_PESTANA });
}

/** Llama a `alAbrirseEnOtra` si otra pestaña anuncia una sesión de `tipo`. Devuelve cómo dejar de escuchar. */
export function escucharOtraPestana(tipo, alAbrirseEnOtra) {
  const c = canalDeSesion();
  if (!c) return () => {};
  const manejar = (evento) => {
    if (evento.data?.tipo === tipo && evento.data.pestana !== ID_PESTANA) alAbrirseEnOtra();
  };
  c.addEventListener("message", manejar);
  return () => c.removeEventListener("message", manejar);
}
