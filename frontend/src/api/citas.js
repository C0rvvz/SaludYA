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

// --- Bloque 5: "Mis citas" ---

// HU-26 (todas) / HU-27 (proximas) / HU-29 (pendientes_confirmar)
export function listarMisCitas(vista = "todas") {
  return apiFetch(`/citas?vista=${vista}`, { auth: true });
}

// HU-26 criterio 4 + HU-18: detalle con el estado y su historial.
export function obtenerMiCita(citaId) {
  return apiFetch(`/citas/${citaId}`, { auth: true });
}

// HU-29 / HU-23
export function confirmarAsistencia(citaId) {
  return apiFetch(`/citas/${citaId}/confirmar-asistencia`, { method: "POST", auth: true });
}

// HU-21: el motivo es opcional.
export function cancelarCita(citaId, motivo) {
  return apiFetch(`/citas/${citaId}/cancelar`, {
    method: "POST",
    auth: true,
    body: { motivo: motivo || null },
  });
}

// HU-20: devuelve la cita NUEVA.
export function reprogramarCita(citaId, disponibilidadId) {
  return apiFetch(`/citas/${citaId}/reprogramar`, {
    method: "POST",
    auth: true,
    body: { disponibilidad_id: disponibilidadId },
  });
}
