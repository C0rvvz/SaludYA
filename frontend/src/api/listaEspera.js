import { apiFetch } from "./client";

// Lista de espera del paciente (HU-19, HU-31, HU-32).
export function listarMiListaEspera() {
  return apiFetch("/lista-espera", { auth: true });
}

export function unirseListaEspera(datos) {
  return apiFetch("/lista-espera", { method: "POST", auth: true, body: datos });
}

export function aceptarCupo(solicitudId) {
  return apiFetch(`/lista-espera/${solicitudId}/aceptar`, { method: "POST", auth: true });
}

export function rechazarCupo(solicitudId) {
  return apiFetch(`/lista-espera/${solicitudId}/rechazar`, { method: "POST", auth: true });
}

export function salirListaEspera(solicitudId) {
  return apiFetch(`/lista-espera/${solicitudId}/salir`, { method: "POST", auth: true });
}
