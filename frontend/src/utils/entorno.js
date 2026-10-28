/**
 * Datos que el servidor de producción pone en la página al entregarla
 * (backend/app/servidor.py), como <meta name="saludya:...">. En desarrollo
 * no existen: ahí se usa frontend/.env.
 */
function datoDelServidor(nombre) {
  return document.querySelector(`meta[name="saludya:${nombre}"]`)?.getAttribute("content") || "";
}

/** La llave pública de "No soy un robot" que configuró el servidor. */
export function llaveTurnstileDelServidor() {
  return datoDelServidor("turnstile");
}

/** Versión de demostración publicada: el código de ingreso se ve en pantalla. */
export function esDemostracion() {
  return datoDelServidor("demostracion") === "1";
}
