import { apiFetch } from "./client";

export function identificarPaciente(numeroDocumento) {
  return apiFetch("/auth/paciente/identificar", {
    method: "POST",
    body: { numero_documento: numeroDocumento },
  });
}

/** `verificacion`: el token de "No soy un robot" (ver components/VerificacionHumana.jsx). */
export function enviarOtp(numeroDocumento, verificacion) {
  return apiFetch("/auth/paciente/otp/enviar", {
    method: "POST",
    body: { numero_documento: numeroDocumento },
    verificacion,
  });
}

export function reenviarOtp(numeroDocumento) {
  return apiFetch("/auth/paciente/otp/reenviar", {
    method: "POST",
    body: { numero_documento: numeroDocumento },
  });
}

export function validarOtp(numeroDocumento, codigo) {
  return apiFetch("/auth/paciente/otp/validar", {
    method: "POST",
    body: { numero_documento: numeroDocumento, codigo },
  });
}

export function obtenerPacienteActual() {
  return apiFetch("/auth/paciente/me", { auth: true });
}

/** Cierra la sesión en el servidor (el token ya se quitó de la pestaña). */
export function salirPaciente(token) {
  return apiFetch("/auth/paciente/salir", { method: "POST", token });
}
