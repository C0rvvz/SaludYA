/**
 * Validaciones de formato en el cliente.
 *
 * Reflejan exactamente las mismas reglas que ya aplica el backend
 * (ver backend/app/schemas/validators.py y
 * backend/app/schemas/paciente.py), para que el paciente vea el
 * error al instante, junto al campo que debe corregir, en vez de
 * enterarse solo después de enviar el formulario.
 *
 * Cada función devuelve "" cuando el valor es válido, o un mensaje
 * en español listo para mostrar cuando no lo es.
 */

const PATRON_SOLO_DIGITOS = /^\d{6,15}$/;
const PATRON_ALFANUMERICO = /^[A-Za-z0-9]{6,15}$/;
const PATRON_CELULAR_CO = /^3\d{9}$/;
// Dominio en partes separadas por puntos: sin solapamientos, se evalúa en tiempo lineal.
const PATRON_CORREO = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function validarNumeroDocumento(valor, tipoDocumento) {
  const v = (valor ?? "").trim();
  if (!v) return "Escriba su número de documento.";

  const esPasaporte = tipoDocumento === "pasaporte";
  const patron = esPasaporte ? PATRON_ALFANUMERICO : PATRON_SOLO_DIGITOS;

  if (!patron.test(v)) {
    return esPasaporte
      ? "El pasaporte debe tener de 6 a 15 letras o números, sin espacios ni símbolos."
      : "El documento debe tener de 6 a 15 números, sin puntos ni espacios.";
  }
  return "";
}

// Letras (con tildes y ñ), espacios, guion y apóstrofo: "María José", "De la Cruz", "O'Neill".
const PATRON_NOMBRE = /^[\p{L}' -]+$/u;

export function validarNombre(valor) {
  const v = (valor ?? "").trim();
  if (!v) return "Escriba su nombre completo.";
  if (v.length < 2) return "El nombre debe tener al menos 2 letras.";
  return "";
}

/**
 * Una parte del nombre en el registro: primer nombre, segundo nombre
 * (opcional) o apellidos. `vacio`: el mensaje si es obligatoria y está vacía.
 */
export function validarParteDelNombre(valor, { vacio = null } = {}) {
  const v = (valor ?? "").trim();
  if (!v) return vacio ?? "";
  if (v.length < 2) return "Escriba al menos 2 letras.";
  if (!PATRON_NOMBRE.test(v)) return "Escriba solo letras, sin números ni símbolos.";
  return "";
}

/** "  laura ", "", "gómez  ruiz" -> "laura gómez ruiz" (como lo guarda el backend). */
export function unirNombre(...partes) {
  return partes
    .map((parte) => (parte ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" ");
}

export function validarTelefonoWhatsapp(valor) {
  const v = (valor ?? "").replace(/[\s-]/g, "");
  if (!v) return "Escriba el número de su celular con WhatsApp.";
  if (!PATRON_CELULAR_CO.test(v)) {
    return "Escriba un celular colombiano de 10 dígitos que empiece por 3 (por ejemplo, 300 123 4567).";
  }
  return "";
}

export function validarCorreo(valor) {
  const v = (valor ?? "").trim();
  if (!v) return ""; // el correo es opcional
  if (!PATRON_CORREO.test(v)) return "Escriba un correo electrónico válido (por ejemplo, nombre@correo.com).";
  return "";
}

export function validarCodigoOtp(valor) {
  const v = (valor ?? "").trim();
  if (!v) return "Escriba el código de 6 dígitos que le enviamos.";
  if (v.length !== 6) return "El código debe tener 6 dígitos.";
  return "";
}