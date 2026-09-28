import { apiFetch } from "./client";

// HU-33: asistente conversacional. Todos requieren la sesión (JWT).

export function enviarMensaje(mensaje) {
  return apiFetch("/chat", { method: "POST", auth: true, body: { mensaje } });
}

export function obtenerConversacion() {
  return apiFetch("/chat", { auth: true });
}

export function reiniciarConversacion() {
  return apiFetch("/chat", { method: "DELETE", auth: true });
}
