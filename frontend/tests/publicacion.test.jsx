import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { abrir, backendFalso } from "./backendFalso";

// En la versión publicada, el servidor (backend/app/servidor.py) le pone a la
// página estos datos como <meta name="saludya:...">.
function datoDelServidor(nombre, valor) {
  const meta = document.createElement("meta");
  meta.name = `saludya:${nombre}`;
  meta.content = valor;
  document.head.appendChild(meta);
}

afterEach(() => {
  document.head.querySelectorAll('meta[name^="saludya:"]').forEach((meta) => meta.remove());
  delete window.turnstile;
});

describe("Versión publicada en internet", () => {
  it("la casilla «No soy un robot» usa la llave que puso el servidor", async () => {
    datoDelServidor("turnstile", "llave-del-servidor");
    const widgets = {};
    window.turnstile = {
      render: (_contenedor, opciones) => {
        widgets.w1 = opciones;
        return "w1";
      },
      execute: () => {},
      reset: () => {},
      remove: () => {},
    };
    backendFalso({ "POST /auth/paciente/identificar": { registrado: true } });
    abrir("/iniciar-sesion");

    expect(await screen.findByRole("checkbox", { name: /No soy un robot/ })).toBeInTheDocument();
    await waitFor(() => expect(widgets.w1?.sitekey).toBe("llave-del-servidor"));
  });

  it("la versión de demostración pide usar solo datos de prueba al ingresar y al registrarse", async () => {
    datoDelServidor("demostracion", "1");
    backendFalso({ "GET /eps": [] });
    abrir("/iniciar-sesion");
    expect(screen.getByRole("note")).toHaveTextContent("Versión de demostración. Use solo datos de prueba, nunca sus datos reales.");

    abrir("/registrarse");
    expect(screen.getByRole("note")).toHaveTextContent("Versión de demostración.");
  });

  it("fuera de la demostración no aparece el aviso", () => {
    backendFalso();
    abrir("/iniciar-sesion");
    expect(screen.queryByText(/Versión de demostración/)).not.toBeInTheDocument();
  });
});
