import { apiFetch } from "./client";

export function identificarPaciente(numeroDocumento) {
  return apiFetch("/auth/paciente/identificar", {
    method: "POST",
    body: { numero_documento: numeroDocumento },
  });
}

export function enviarOtp(numeroDocumento) {
  return apiFetch("/auth/paciente/otp/enviar", {
    method: "POST",
    body: { numero_documento: numeroDocumento },
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
