import { apiFetch, conFiltros } from "./client";

export function listarEspecialidades() {
  return apiFetch("/especialidades");
}

export function listarSedes() {
  return apiFetch("/sedes");
}

/**
 * El primer horario libre de cada médico: basta para saber con cuántos
 * médicos y desde cuándo hay cupo (inicio y paso 1 de "Agendar"), y pesa
 * mucho menos que traer todos los horarios.
 */
export function primerCupoDeCadaMedico() {
  return apiFetch("/disponibilidad/primeras");
}

/**
 * HU-11: búsqueda combinada. `filtros` puede traer cualquier
 * combinación de especialidad_id, ciudad, sede_id, modalidad, fecha,
 * hora -- los que vengan vacíos/undefined simplemente no se envían.
 */
export function buscarDisponibilidad(filtros = {}) {
  return apiFetch(conFiltros("/disponibilidad/buscar", filtros));
}

// Especialistas de una especialidad, con las sedes donde atienden.
export function listarEspecialistas(especialidadId) {
  return apiFetch(`/especialistas?especialidad_id=${especialidadId}`);
}
