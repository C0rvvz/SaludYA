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

// Sesiones separadas: la del paciente y la del personal (apartado de
// administración) nunca se mezclan; el backend rechaza el token del otro lado.
export const TOKEN_PACIENTE = "saludya_token";
export const TOKEN_PERSONAL = "saludya_personal_token";

/**
 * Llama al backend. `auth: true` agrega el header Authorization con
 * el token del paciente (lo necesitan todos los endpoints protegidos a
 * partir de la Parte 6 del backend: /auth/paciente/me, /citas, etc.).
 * `auth: "personal"` usa el token del personal (/admin/...).
 */
export async function apiFetch(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = localStorage.getItem(auth === "personal" ? TOKEN_PERSONAL : TOKEN_PACIENTE);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      // Sin esto, el navegador puede reutilizar una respuesta guardada
      // para la misma URL (p. ej. GET /auth/paciente/me) aunque el
      // Authorization sea de otro usuario -- causaba que, al iniciar
      // sesión con un paciente distinto, siguiera mostrando los datos
      // del paciente anterior hasta refrescar la página a la fuerza.
      cache: "no-store",
    });
  } catch {
    // fetch() rechaza (sin llegar a haber respuesta) cuando no hay
    // conexión, el servidor está caído, o el navegador bloquea la
    // petición -- se traduce a un mensaje entendible en vez de dejar
    // pasar el error técnico original (ej. "Failed to fetch").
    throw new ApiError(
      0,
      "No fue posible conectar con el servidor. Verifica tu conexión a internet e intenta de nuevo."
    );
  }

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