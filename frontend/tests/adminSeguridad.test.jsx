import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { PERSONAL } from "./datos";

function panel(cambios = {}) {
  return {
    desde: "2026-10-23T10:00:00-05:00",
    hasta: "2026-10-24T10:00:00-05:00",
    indicadores: {
      ingresos_exitosos: 12,
      ingresos_fallidos: 6,
      bloqueos: 1,
      accesos_denegados: 3,
      sesiones_activas: 2,
      alertas_altas: 1,
    },
    alertas: [
      {
        clave: "fuerza_bruta",
        severidad: "alta",
        titulo: "Posible ataque de fuerza bruta desde 10.0.0.9",
        descripcion: "6 intentos fallidos de ingreso en 15 minutos desde la misma conexión.",
        recomendacion: "Si no reconoce esta conexión, bloquéela en el firewall.",
        cantidad: 6,
        ultima_vez: "2026-10-24T09:15:00-05:00",
        ip: "10.0.0.9",
        sujeto: null,
      },
    ],
    sesiones_activas: [
      {
        id: "s-yo", tipo: "personal", nombre: "Ana Admin (Administrador)", identificador: PERSONAL.correo,
        ip: "10.0.0.1", dispositivo: "Chrome en Windows",
        creada_en: "2026-10-24T09:00:00-05:00", ultima_actividad_en: "2026-10-24T09:59:00-05:00",
      },
      {
        id: "s-otro", tipo: "personal", nombre: "Carlos Call (Call center)", identificador: "carlos@saludya.co",
        ip: "10.0.0.9", dispositivo: "Firefox en Linux",
        creada_en: "2026-10-24T09:10:00-05:00", ultima_actividad_en: "2026-10-24T09:58:00-05:00",
      },
    ],
    eventos: [
      {
        id: "e1", fecha: "2026-10-24T09:15:00-05:00", tipo: "ingreso_fallido", tipo_texto: "Ingreso fallido",
        severidad: "media", ambito: "personal", sujeto_nombre: "Carlos Call (Call center)",
        identificador: "carlos@saludya.co", ip: "10.0.0.9", dispositivo: "Firefox en Linux",
        descripcion: "Contraseña incorrecta", detalle: null,
      },
      {
        id: "e2", fecha: "2026-10-24T09:00:00-05:00", tipo: "ingreso_exitoso", tipo_texto: "Ingreso exitoso",
        severidad: "info", ambito: "paciente", sujeto_nombre: "Mario Ruiz",
        identificador: "Documento terminado en 5678", ip: "10.0.0.5", dispositivo: null,
        descripcion: "Ingresó al portal del paciente", detalle: null,
      },
    ],
    controles: [{ nombre: "Una sola sesión por cuenta", detalle: "La sesión anterior se cierra." }],
    ...cambios,
  };
}

describe("Seguridad", () => {
  it("muestra cifras, alertas con qué hacer, eventos y controles; cambia de periodo", async () => {
    const llamadas = backendFalso({ "GET /admin/seguridad": () => panel() });
    const usuario = abrir("/admin/seguridad", { personal: true });

    const resumen = (await screen.findByRole("heading", { name: "Resumen del periodo" })).closest("section");
    expect(within(resumen).getByText("Intentos fallidos").nextSibling).toHaveTextContent("6");
    const alertas = screen.getByRole("heading", { name: "Alertas" }).closest("section");
    expect(within(alertas).getByText("Posible ataque de fuerza bruta desde 10.0.0.9")).toBeInTheDocument();
    expect(within(alertas).getByText(/Si no reconoce esta conexión/)).toBeInTheDocument();
    expect(within(alertas).getByText("1 de severidad alta")).toBeInTheDocument();
    expect(screen.getByText("Una sola sesión por cuenta")).toBeInTheDocument();

    // Eventos: filtros por severidad y por texto.
    const eventos = screen.getByRole("heading", { name: "Eventos de seguridad" }).closest("section");
    expect(within(eventos).getByText("Documento terminado en 5678")).toBeInTheDocument();
    await usuario.click(within(eventos).getByRole("button", { name: "Media 1" }));
    expect(within(eventos).queryByText("Mario Ruiz")).not.toBeInTheDocument();
    await usuario.click(within(eventos).getByRole("button", { name: "Todos 2" }));
    await usuario.type(within(eventos).getByLabelText("Buscar"), "10.0.0.5");
    expect(within(eventos).queryByText("Contraseña incorrecta")).not.toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText("Periodo"), "168");
    expect(llamadasA(llamadas, "GET", "/admin/seguridad").at(-1).query).toEqual({ horas: "168" });
  });

  it("cierra a distancia una sesión que no se reconoce, nunca la propia", async () => {
    const llamadas = backendFalso({
      "GET /admin/seguridad": () => panel(),
      "POST /admin/seguridad/sesiones/:id/cerrar": null,
    });
    const usuario = abrir("/admin/seguridad", { personal: true });
    const sesiones = (await screen.findByRole("heading", { name: "Sesiones activas" })).closest("section");
    expect(within(sesiones).getByText("Su sesión")).toBeInTheDocument();
    expect(within(sesiones).queryByRole("button", { name: "Cerrar la sesión de Ana Admin (Administrador)" })).toBeNull();

    await usuario.click(within(sesiones).getByRole("button", { name: "Cerrar la sesión de Carlos Call (Call center)" }));
    expect(screen.getByText("¿Desea cerrar la sesión de Carlos Call (Call center)?")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "No, volver" }));
    expect(llamadasA(llamadas, "POST", "/admin/seguridad/sesiones/s-otro/cerrar")).toHaveLength(0);

    await usuario.click(within(sesiones).getByRole("button", { name: "Cerrar la sesión de Carlos Call (Call center)" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, cerrar la sesión" }));
    expect(await esperarTexto(/Se cerró la sesión de Carlos Call/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/seguridad/sesiones/s-otro/cerrar")).toHaveLength(1);
  });

  it("sin alertas ni sesiones lo dice; y si no carga, el error", async () => {
    backendFalso({ "GET /admin/seguridad": panel({ alertas: [], sesiones_activas: [] }) });
    abrir("/admin/seguridad", { personal: true });
    expect(await esperarTexto("Sin alertas en este periodo.")).toBeInTheDocument();
    expect(screen.getByText("No hay nadie conectado en este momento.")).toBeInTheDocument();

    backendFalso({ "GET /admin/seguridad": error(403, "Su rol no tiene permiso para realizar esta acción.") });
    abrir("/admin/seguridad", { personal: true });
    expect(await esperarTexto("Su rol no tiene permiso para realizar esta acción.")).toBeInTheDocument();
  });
});
