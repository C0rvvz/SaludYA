import { apiFetch } from "./client";

// Apartado de administración: todas usan la sesión del personal.
const conPersonal = (path, opciones = {}) => apiFetch(path, { ...opciones, auth: "personal" });

// --- Cuentas ---
export function iniciarSesionPersonal(correo, password) {
  return apiFetch("/admin/auth/login", { method: "POST", body: { correo, password } });
}

export function obtenerPersonalActual() {
  return conPersonal("/admin/auth/me");
}

export function listarUsuarios() {
  return conPersonal("/admin/usuarios");
}

export function crearUsuario(datos) {
  return conPersonal("/admin/usuarios", { method: "POST", body: datos });
}

export function actualizarUsuario(id, cambios) {
  return conPersonal(`/admin/usuarios/${id}`, { method: "PATCH", body: cambios });
}

// --- Gestión de citas (HU-34 a HU-43) ---
export function listarCitasAdmin(filtros = {}) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.set(clave, valor);
  });
  const query = params.toString();
  return conPersonal(`/admin/citas${query ? `?${query}` : ""}`);
}

export function obtenerCitaAdmin(id) {
  return conPersonal(`/admin/citas/${id}`);
}

export function confirmarCitaAdmin(id) {
  return conPersonal(`/admin/citas/${id}/confirmar`, { method: "POST" });
}

export function cancelarCitaAdmin(id, motivo) {
  return conPersonal(`/admin/citas/${id}/cancelar`, { method: "POST", body: { motivo: motivo || null } });
}

export function reprogramarCitaAdmin(id, disponibilidadId) {
  return conPersonal(`/admin/citas/${id}/reprogramar`, {
    method: "POST",
    body: { disponibilidad_id: disponibilidadId },
  });
}

export function enviarRecordatorioAdmin(id) {
  return conPersonal(`/admin/citas/${id}/recordatorio`, { method: "POST" });
}

export function registrarContactoAdmin(id, resultado, nota) {
  return conPersonal(`/admin/citas/${id}/contacto`, {
    method: "POST",
    body: { resultado, nota: nota || null },
  });
}

export function registrarResultadoAdmin(id, resultado) {
  return conPersonal(`/admin/citas/${id}/resultado`, { method: "POST", body: { resultado } });
}

export function agregarObservacionAdmin(pacienteId, texto, citaId) {
  return conPersonal(`/admin/pacientes/${pacienteId}/observaciones`, {
    method: "POST",
    body: { texto, cita_id: citaId || null },
  });
}

// --- Auditoría (HU-80 a HU-85) ---
export function listarAuditoria(filtros = {}) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.set(clave, valor);
  });
  const query = params.toString();
  return conPersonal(`/admin/auditoria${query ? `?${query}` : ""}`);
}

// --- Dashboard y Reportes (HU-44, HU-48 a HU-52, HU-68 a HU-75) ---
export function obtenerReporte(periodo) {
  return conPersonal(`/admin/reportes?periodo=${periodo}`);
}
