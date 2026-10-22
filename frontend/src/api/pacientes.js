import { apiFetch } from "./client";

/** `verificacion`: el token de "No soy un robot" (ver components/VerificacionHumana.jsx). */
export function registrarPaciente(datos, verificacion) {
  return apiFetch("/pacientes/registro", { method: "POST", body: datos, verificacion });
}
