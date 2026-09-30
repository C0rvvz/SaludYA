import { apiFetch } from "./client";

// Solicitudes de cita del paciente (cartas de petición).
export function listarMisSolicitudes() {
  return apiFetch("/solicitudes", { auth: true });
}

export function radicarSolicitud(datos) {
  return apiFetch("/solicitudes", { method: "POST", auth: true, body: datos });
}
