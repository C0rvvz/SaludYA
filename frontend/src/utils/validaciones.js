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
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarNumeroDocumento(valor, tipoDocumento) {
  const v = (valor ?? "").trim();
  if (!v) return "Ingresa tu número de documento.";

  const esPasaporte = tipoDocumento === "pasaporte";
  const patron = esPasaporte ? PATRON_ALFANUMERICO : PATRON_SOLO_DIGITOS;

  if (!patron.test(v)) {
    return esPasaporte
      ? "Debe tener entre 6 y 15 caracteres alfanuméricos (letras y números, sin espacios ni símbolos)."
      : "Debe contener solo dígitos, entre 6 y 15 caracteres.";
  }
  return "";
}

export function validarNombre(valor) {
  const v = (valor ?? "").trim();
  if (!v) return "Ingresa tu nombre completo.";
  if (v.length < 2) return "El nombre debe tener al menos 2 caracteres.";
  return "";
}

export function validarTelefonoWhatsapp(valor) {
  const v = (valor ?? "").replace(/[\s-]/g, "");
  if (!v) return "Ingresa tu número de WhatsApp.";
  if (!PATRON_CELULAR_CO.test(v)) {
    return "Debe ser un celular colombiano válido: 10 dígitos, comienza en 3.";
  }
  return "";
}

export function validarCorreo(valor) {
  const v = (valor ?? "").trim();
  if (!v) return ""; // el correo es opcional
  if (!PATRON_CORREO.test(v)) return "Ingresa un correo electrónico válido.";
  return "";
}

export function validarCodigoOtp(valor) {
  const v = (valor ?? "").trim();
  if (!v) return "Ingresa el código de verificación.";
  if (v.length !== 6) return "El código debe tener 6 dígitos.";
  return "";
}