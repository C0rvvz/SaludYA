import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom no implementa el desplazamiento (lo usa el chat para ir al último mensaje).
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear(); // ahí viven los tokens (utils/sesion.js)
  vi.restoreAllMocks();
  vi.unstubAllGlobals(); // p. ej. el micrófono simulado del dictado
  vi.useRealTimers();
});
