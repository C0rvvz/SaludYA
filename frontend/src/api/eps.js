import { apiFetch } from "./client";

export function listarEps() {
  return apiFetch("/eps");
}
