import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrir, backendFalso } from "./backendFalso";
import { ESPECIALIDAD, PACIENTE, SANITAS, SAVIA, SURA, franja } from "./datos";

const TARIFAS = { eps: 8000, aliada: 12000, particular: 100000 };
const SURENA = { ...PACIENTE, tarifas: TARIFAS };

// Tres médicos de Cardiología: uno de Sura (la EPS de la paciente), uno de Savia (aliada) y uno de Sanitas.
const DE_SURA = { id: "m-sura", nombre: "Dr. Carlos Ramírez", especialidad: ESPECIALIDAD, eps: SURA };
const DE_SAVIA = { id: "m-savia", nombre: "Dra. Claudia Vélez", especialidad: ESPECIALIDAD, eps: SAVIA };
const DE_SANITAS = { id: "m-sanitas", nombre: "Dr. Nicolás Peláez", especialidad: ESPECIALIDAD, eps: SANITAS };
const PARTICULAR = { id: "m-part", nombre: "Dr. Mauricio Gil", especialidad: ESPECIALIDAD, eps: null };
const HORARIOS = [
  franja("h1", "2026-10-20", "08:00:00", { especialista: DE_SANITAS }), // el más cercano, pero de otra EPS
  franja("h2", "2026-10-20", "09:00:00", { especialista: DE_SAVIA }),
  franja("h3", "2026-10-21", "10:00:00", { especialista: DE_SURA }),
  franja("h4", "2026-10-21", "11:00:00", { especialista: PARTICULAR }),
];

function rutas(paciente = SURENA) {
  return {
    "GET /auth/paciente/me": paciente,
    "GET /especialidades": [ESPECIALIDAD],
    "GET /disponibilidad/buscar": HORARIOS,
  };
}

describe("Médicos por EPS", () => {
  it("cada médico con su EPS y su valor: su EPS y aliadas, particulares (cuestan más) y otras EPS en gris", async () => {
    backendFalso(rutas());
    const usuario = abrir("/panel?especialidad=esp-1", { paciente: true });
    expect(await screen.findByText("Médicos de su EPS y EPS aliadas")).toBeInTheDocument();

    const propio = screen.getByRole("button", { name: /Dr\. Carlos Ramírez/ });
    expect(within(propio).getByText("Sura")).toHaveClass("eps-medico--propia");
    const aliado = screen.getByRole("button", { name: /Dra\. Claudia Vélez/ });
    expect(within(propio).getByText("$8.000")).toBeInTheDocument();
    expect(within(aliado).getByText("Savia · aliada")).toHaveClass("eps-medico--aliada");
    expect(within(aliado).getByText("$12.000")).toBeInTheDocument();
    expect(aliado).toBeEnabled();

    // Particulares: se pueden agendar, con el aviso de que cuestan más.
    expect(screen.getByText(/Su EPS no cubre estas consultas/)).toHaveTextContent("cuestan más");
    const particular = screen.getByRole("button", { name: /Dr. Mauricio Gil/ });
    expect(within(particular).getByText("Particular")).toHaveClass("eps-medico--particular");
    expect(within(particular).getByText("$100.000")).toBeInTheDocument();
    expect(particular).toBeEnabled();

    expect(screen.getByText("De otras EPS (no disponibles)")).toBeInTheDocument();
    const deOtra = screen.getByRole("button", { name: /Dr\. Nicolás Peláez/ });
    expect(deOtra).toBeDisabled();
    expect(within(deOtra).getByText("Sanitas")).toHaveClass("eps-medico--otra");
    expect(within(deOtra).getByText("No disponible con su EPS")).toBeInTheDocument();

    // El elegido de entrada es el primero que puede usar (no el de Sanitas, aunque sea más cercano).
    expect(aliado).toHaveAttribute("aria-pressed", "true");
    await usuario.click(propio);
    expect(propio).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Copago EPS Sura · lo paga después de la cita")).toBeInTheDocument();
    await usuario.click(particular);
    expect(screen.getByText("Consulta particular · lo paga después de la cita")).toBeInTheDocument();
  });

  it("al buscar por nombre, el médico de otra EPS sale en gris y no se puede elegir", async () => {
    backendFalso(rutas());
    const usuario = abrir("/panel", { paciente: true });
    // La especialidad cuenta los médicos que puede usar (su EPS, aliadas y particulares).
    expect(await screen.findByText("3 profesionales")).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Buscar una especialidad o un médico"), "Dr");
    const encontrados = screen.getByRole("region", { name: "Médicos" });
    expect(within(encontrados).getByRole("button", { name: /Nicolás Peláez/ })).toBeDisabled();
    expect(within(encontrados).getByRole("button", { name: /Carlos Ramírez/ })).toBeEnabled();
  });

  it("un paciente particular (sin EPS) puede elegir cualquier médico", async () => {
    backendFalso(rutas({ ...SURENA, eps: null, eps_id: null, eps_aliadas: [], particular: true }));
    abrir("/panel?especialidad=esp-1", { paciente: true });
    expect(await screen.findByText(/Como no tiene EPS, sus consultas son/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nicolás Peláez/ })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: /\$100\.000/ })).toHaveLength(4); // las 4 tarjetas: todas particulares
    expect(screen.queryByText("De otras EPS (no disponibles)")).not.toBeInTheDocument();
  });
});
