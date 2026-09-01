const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "Ocurrió un error inesperado.");
    this.status = status;
    this.detail = detail;
  }
}

function extraerMensaje(payload) {
  // FastAPI: errores de negocio -> {"detail": "texto"}
  //          errores de validación (422) -> {"detail": [{"msg": "...", ...}, ...]}
  if (!payload) return "Ocurrió un error inesperado.";
  const { detail } = payload;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d.msg).join(" ");
  }
  return "Ocurrió un error inesperado.";
}

/**
 * Llama al backend. `auth: true` agrega el header Authorization con
 * el token guardado (lo necesitan todos los endpoints protegidos a
 * partir de la Parte 6 del backend: /auth/paciente/me, /citas, etc.).
 */
export async function apiFetch(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = localStorage.getItem("saludya_token");
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // respuestas sin cuerpo (poco común aquí, pero no debe romper)
  }

  if (!response.ok) {
    throw new ApiError(response.status, extraerMensaje(payload));
  }

  return payload;
}
