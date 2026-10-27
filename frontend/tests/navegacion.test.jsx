import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TOKEN_PACIENTE } from "../src/api/client";
import { abrir, backendFalso } from "./backendFalso";
import { FRANJAS, SEDE } from "./datos";

describe("Navegación del paciente", () => {
  it("tocar una pestaña del menú sube la página, aunque ya esté en ella", async () => {
    backendFalso({ "GET /citas": [] });
    const subir = vi.spyOn(window, "scrollTo");
    const usuario = abrir("/mis-citas", { paciente: true });
    await screen.findByRole("heading", { name: "Mis citas" });
    subir.mockClear();
    const [pestana] = screen.getAllByRole("link", { name: /Mis citas/ });
    await usuario.click(pestana);
    expect(subir).toHaveBeenCalledWith({ top: 0 });
  });

  it("el logo lleva al inicio de SaludYA sin cerrar la sesión", async () => {
    backendFalso({ "GET /citas": [], "GET /disponibilidad/buscar": FRANJAS, "GET /sedes": [SEDE] });
    const usuario = abrir("/mis-citas", { paciente: true });
    await screen.findByRole("heading", { name: "Mis citas" });
    await usuario.click(screen.getByRole("link", { name: "SaludYA, ir al inicio" }));
    expect(await screen.findByRole("heading", { name: "Su cita médica, sin filas ni llamadas." })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Agendar cita" }).length).toBeGreaterThan(0); // sigue con su sesión
    expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBe("token-paciente");
  });
});
