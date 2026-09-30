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

// --- Centro de recordatorios (HU-62 a HU-67) ---
export function listarRecordatorios() {
  return conPersonal("/admin/recordatorios");
}

export function obtenerPlantillas(pacienteId, citaId) {
  const params = new URLSearchParams({ paciente_id: pacienteId });
  if (citaId) params.set("cita_id", citaId);
  return conPersonal(`/admin/recordatorios/plantillas?${params}`);
}

export function listarProgramados() {
  return conPersonal("/admin/recordatorios/programados");
}

export function programarRecordatorio(datos) {
  return conPersonal("/admin/recordatorios/programados", { method: "POST", body: datos });
}

export function editarRecordatorio(id, datos) {
  return conPersonal(`/admin/recordatorios/programados/${id}`, { method: "PUT", body: datos });
}

export function cancelarRecordatorio(id) {
  return conPersonal(`/admin/recordatorios/programados/${id}/cancelar`, { method: "POST" });
}

export function reintentarRecordatorio(id) {
  return conPersonal(`/admin/recordatorios/programados/${id}/reintentar`, { method: "POST" });
}

// --- Lista de espera (Fase D: HU-45, HU-53 a HU-61) ---
export function listarListaEsperaAdmin(dia) {
  return conPersonal(`/admin/lista-espera${dia ? `?dia=${dia}` : ""}`);
}

export function horariosListaEspera(solicitudId) {
  return conPersonal(`/admin/lista-espera/${solicitudId}/horarios`);
}

export function cambiarPrioridadListaEspera(solicitudId, prioridad) {
  return conPersonal(`/admin/lista-espera/${solicitudId}/prioridad`, { method: "PATCH", body: { prioridad } });
}

export function confirmarDesdeListaEspera(solicitudId, disponibilidadId) {
  return conPersonal(`/admin/lista-espera/${solicitudId}/confirmar`, {
    method: "POST",
    body: { disponibilidad_id: disponibilidadId },
  });
}

export function cancelarDesdeListaEspera(solicitudId, motivo) {
  return conPersonal(`/admin/lista-espera/${solicitudId}/cancelar`, {
    method: "POST",
    body: { motivo: motivo || null },
  });
}

// --- Solicitudes de cita (cartas de petición) y revisión clínica (HU-76 a HU-79) ---
export function listarSolicitudesAdmin() {
  return conPersonal("/admin/solicitudes");
}

export function obtenerRevisionClinica(solicitudId) {
  return conPersonal(`/admin/solicitudes/${solicitudId}`);
}

export function aprobarSolicitud(solicitudId, datos) {
  return conPersonal(`/admin/solicitudes/${solicitudId}/aprobar`, { method: "POST", body: datos });
}

export function enviarSolicitudEps(solicitudId, respuesta) {
  return conPersonal(`/admin/solicitudes/${solicitudId}/enviar-eps`, {
    method: "POST",
    body: { respuesta: respuesta || null },
  });
}

export function negarSolicitud(solicitudId, respuesta) {
  return conPersonal(`/admin/solicitudes/${solicitudId}/negar`, { method: "POST", body: { respuesta } });
}
