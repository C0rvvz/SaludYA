import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom no implementa el desplazamiento (lo usa el chat para ir al último mensaje).
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
