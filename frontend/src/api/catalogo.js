import { apiFetch } from "./client";

export function listarEspecialidades() {
  return apiFetch("/especialidades");
}

export function listarSedes() {
  return apiFetch("/sedes");
}

/**
 * HU-11: búsqueda combinada. `filtros` puede traer cualquier
 * combinación de especialidad_id, ciudad, sede_id, modalidad, fecha,
 * hora -- los que vengan vacíos/undefined simplemente no se envían.
 */
export function buscarDisponibilidad(filtros = {}) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.set(clave, valor);
  });
  const query = params.toString();
  return apiFetch(`/disponibilidad/buscar${query ? `?${query}` : ""}`);
}
