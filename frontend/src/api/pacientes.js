import { apiFetch } from "./client";

export function registrarPaciente(datos) {
  return apiFetch("/pacientes/registro", { method: "POST", body: datos });
}
