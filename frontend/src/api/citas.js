import { apiFetch } from "./client";

export function confirmarCita(disponibilidadId, canalRecordatorio) {
  return apiFetch("/citas", {
    method: "POST",
    auth: true,
    body: {
      disponibilidad_id: disponibilidadId,
      canal_recordatorio: canalRecordatorio,
    },
  });
}

export function obtenerComprobante(citaId) {
  return apiFetch(`/citas/${citaId}/comprobante`, { auth: true });
}
