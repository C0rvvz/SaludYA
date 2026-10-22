import { avisarSesionCerrada, borrarToken, leerToken, marcarActividad } from "../utils/sesion";

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
// Dónde y cómo se guardan: utils/sesion.js.
export { TOKEN_PACIENTE, TOKEN_PERSONAL } from "../utils/sesion";

/** "/ruta?clave=valor&...", solo con los filtros que tienen valor. */
export function conFiltros(path, filtros = {}) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor) params.set(clave, valor);
  }
  const query = params.toString();
  return query ? path + "?" + query : path;
}

/**
 * Llama al backend. `auth: true` agrega el header Authorization con
 * el token del paciente (lo necesitan todos los endpoints protegidos:
 * /auth/paciente/me, /citas, etc.). `auth: "personal"` usa el token del
 * personal (/admin/...). Si el servidor rechaza la sesión (401), se avisa
 * para cerrarla en esta pestaña y mostrar el motivo al volver a ingresar.
 *
 * `token`: para cerrar sesión con un token que ya se quitó de la pestaña.
 */
export async function apiFetch(path, { method = "GET", body, auth, token: tokenExplicito } = {}) {
  const headers = { "Content-Type": "application/json" };
  const tipo = auth === "personal" ? "personal" : "paciente";
  const conSesion = Boolean(auth) && Boolean(leerToken(tipo));

  if (conSesion) headers.Authorization = `Bearer ${leerToken(tipo)}`;
  else if (tokenExplicito) headers.Authorization = `Bearer ${tokenExplicito}`;

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
    const mensaje = extraerMensaje(payload);
    if (conSesion && response.status === 401) {
      borrarToken(tipo);
      avisarSesionCerrada(tipo, mensaje);
    }
    throw new ApiError(response.status, mensaje);
  }

  if (conSesion) marcarActividad(tipo);
  return payload;
}