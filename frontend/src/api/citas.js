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

// HU-24: el paciente se presenta a su cita (check-in).
export function registrarLlegada(citaId) {
  return apiFetch(`/citas/${citaId}/registrar-llegada`, { method: "POST", auth: true });
}

// HU-23: desde el enlace del recordatorio, SIN sesión (el token del
// enlace ya autoriza esta única acción).
export function confirmarAsistenciaPorEnlace(token) {
  return apiFetch("/citas/confirmar-asistencia/enlace", { method: "POST", body: { token } });
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

// HU-71: calificar la atención de una cita atendida (1 a 5, comentario opcional).
export function calificarCita(citaId, calificacion, comentario) {
  return apiFetch(`/citas/${citaId}/calificar`, {
    method: "POST",
    auth: true,
    body: { calificacion, comentario: comentario || null },
  });
}
