import { llaveTurnstileDelServidor } from "./entorno";

/**
 * "No soy un robot" con Cloudflare Turnstile: carga el script una sola vez.
 * La llave pública va en VITE_TURNSTILE_SITEKEY (desarrollo) o la pone el
 * servidor en la página (producción, TURNSTILE_SITEKEY); sin ella la
 * casilla no se muestra (el backend tampoco la exige si no tiene TURNSTILE_SECRET).
 */

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let carga = null;

export function llaveVerificacion() {
  return import.meta.env.VITE_TURNSTILE_SITEKEY || llaveTurnstileDelServidor();
}

export function cargarTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carga ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => {
      carga = null; // que se pueda intentar de nuevo
      reject(new Error("No se pudo cargar la verificación."));
    };
    document.head.appendChild(script);
  });
  return carga;
}
