import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrir, backendFalso } from "./backendFalso";
import { ESPECIALIDAD, PACIENTE, SANITAS, SAVIA, SURA, franja } from "./datos";

// Tres médicos de Cardiología: uno de Sura (la EPS de la paciente), uno de Savia (aliada) y uno de Sanitas.
const DE_SURA = { id: "m-sura", nombre: "Dr. Carlos Ramírez", especialidad: ESPECIALIDAD, eps: SURA };
const DE_SAVIA = { id: "m-savia", nombre: "Dra. Claudia Vélez", especialidad: ESPECIALIDAD, eps: SAVIA };
const DE_SANITAS = { id: "m-sanitas", nombre: "Dr. Nicolás Peláez", especialidad: ESPECIALIDAD, eps: SANITAS };
const HORARIOS = [
  franja("h1", "2026-10-20", "08:00:00", { especialista: DE_SANITAS }), // el más cercano, pero de otra EPS
  franja("h2", "2026-10-20", "09:00:00", { especialista: DE_SAVIA }),
  franja("h3", "2026-10-21", "10:00:00", { especialista: DE_SURA }),
];

function rutas(paciente = PACIENTE) {
  return {
    "GET /auth/paciente/me": paciente,
    "GET /especialidades": [ESPECIALIDAD],
    "GET /disponibilidad/buscar": HORARIOS,
  };
}

describe("Médicos por EPS", () => {
  it("cada médico con su EPS: los de su EPS y aliadas se eligen; los de otras, en gris y aparte", async () => {
    backendFalso(rutas());
    const usuario = abrir("/panel?especialidad=esp-1", { paciente: true });
    expect(await screen.findByText("2 médicos con cupo")).toBeInTheDocument();

    const propio = screen.getByRole("button", { name: /Dr\. Carlos Ramírez/ });
    expect(within(propio).getByText("Sura")).toHaveClass("eps-medico--propia");
    const aliado = screen.getByRole("button", { name: /Dra\. Claudia Vélez/ });
    expect(within(aliado).getByText("Aliada · Savia")).toHaveClass("eps-medico--aliada");
    expect(aliado).toBeEnabled();

    expect(screen.getByText("De otras EPS (no disponibles con la suya)")).toBeInTheDocument();
    const deOtra = screen.getByRole("button", { name: /Dr\. Nicolás Peláez/ });
    expect(deOtra).toBeDisabled();
    expect(within(deOtra).getByText("Sanitas")).toHaveClass("eps-medico--otra");
    expect(within(deOtra).getByText("No disponible con su EPS")).toBeInTheDocument();

    // El elegido de entrada es el primero que puede usar (no el de Sanitas, aunque sea más cercano).
    expect(aliado).toHaveAttribute("aria-pressed", "true");
    await usuario.click(propio);
    expect(propio).toHaveAttribute("aria-pressed", "true");
  });

  it("al buscar por nombre, el médico de otra EPS sale en gris y no se puede elegir", async () => {
    backendFalso(rutas());
    const usuario = abrir("/panel", { paciente: true });
    // La especialidad cuenta solo los médicos que puede usar.
    expect(await screen.findByText("2 profesionales")).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Buscar una especialidad o un médico"), "Dr");
    const encontrados = screen.getByRole("region", { name: "Médicos" });
    expect(within(encontrados).getByRole("button", { name: /Nicolás Peláez/ })).toBeDisabled();
    expect(within(encontrados).getByRole("button", { name: /Carlos Ramírez/ })).toBeEnabled();
  });

  it("un paciente particular (sin EPS) puede elegir cualquier médico", async () => {
    backendFalso(rutas({ ...PACIENTE, eps: null, eps_id: null, eps_aliadas: [], particular: true }));
    abrir("/panel?especialidad=esp-1", { paciente: true });
    expect(await screen.findByText("3 médicos con cupo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nicolás Peláez/ })).toBeEnabled();
    expect(screen.queryByText("De otras EPS (no disponibles con la suya)")).not.toBeInTheDocument();
  });
});
