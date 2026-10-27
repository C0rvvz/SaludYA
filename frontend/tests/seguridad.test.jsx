import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TOKEN_PACIENTE, TOKEN_PERSONAL } from "../src/api/client";
import { MENSAJE_CAMPO_PROTEGIDO } from "../src/utils/campoProtegido";
import { guardarMotivoCierre } from "../src/utils/sesion";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";

describe("RNF-16: ingreso sin copiar, pegar ni seleccionar", () => {
  it("en el ingreso del paciente no se puede pegar ni copiar", async () => {
    backendFalso();
    const usuario = abrir("/iniciar-sesion");
    const documento = screen.getByLabelText("Número de documento");

    await usuario.click(documento);
    await usuario.paste("1020304050");
    expect(documento).toHaveValue("");
    expect(screen.getByText(MENSAJE_CAMPO_PROTEGIDO)).toBeInTheDocument();

    await usuario.type(documento, "1020");
    expect(documento).toHaveValue("1020"); // escribir a mano sí funciona
    expect(fireEvent.copy(documento)).toBe(false); // copiar se cancela
    expect(fireEvent.cut(documento)).toBe(false);
    expect(fireEvent.drop(documento)).toBe(false);
    expect(fireEvent.contextMenu(documento)).toBe(false);
    expect(documento).toHaveAttribute("autocomplete", "off");

    // Nada de la pantalla se puede copiar (ni seleccionar: ver .auth-page--protegida).
    const titulo = screen.getByRole("heading", { name: "Ingrese su número de documento" });
    expect(fireEvent.copy(titulo)).toBe(false);
    expect(document.querySelector(".auth-page--protegida")).toBeInTheDocument();
  });

  it("en el ingreso del personal tampoco, ni en la contraseña", async () => {
    backendFalso();
    const usuario = abrir("/admin/ingresar");
    const clave = screen.getByLabelText("Contraseña");
    await usuario.click(clave);
    await usuario.paste("una-clave-robada");
    expect(clave).toHaveValue("");
    expect(screen.getByText(MENSAJE_CAMPO_PROTEGIDO)).toBeInTheDocument();
    expect(fireEvent.paste(screen.getByLabelText("Correo institucional"))).toBe(false);
  });

  it("el registro sí permite pegar (no es el ingreso)", async () => {
    backendFalso({ "GET /eps": [] });
    const usuario = abrir("/registrarse");
    await usuario.click(screen.getByLabelText("Nombre completo"));
    await usuario.paste("Laura Gómez");
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Laura Gómez");
  });
});

describe("No soy un robot (Cloudflare Turnstile)", () => {
  function turnstileFalso() {
    const widgets = {};
    window.turnstile = {
      render: (_contenedor, opciones) => {
        widgets.w1 = opciones;
        return "w1";
      },
      execute: (id) => widgets[id].callback(`token-${id}`),
      reset: () => {},
      remove: () => {},
    };
    return widgets;
  }

  it("sin marcar la casilla no envía el código; marcada, manda el token al backend", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITEKEY", "llave-de-prueba");
    const widgets = turnstileFalso();
    backendFalso({
      "POST /auth/paciente/identificar": { registrado: true },
      "POST /auth/paciente/otp/enviar": { telefono_enmascarado: "******4567", codigo_demo: null },
    });
    const usuario = abrir("/iniciar-sesion");
    await usuario.type(screen.getByLabelText("Número de documento"), "1020304050");
    await usuario.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await esperarTexto("Marque la casilla «No soy un robot» antes de continuar.")).toBeInTheDocument();

    const casilla = await screen.findByRole("checkbox", { name: /No soy un robot/ });
    expect(casilla).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(widgets.w1).toBeDefined()); // Cloudflare ya dibujó su reto (invisible)
    expect(widgets.w1.sitekey).toBe("llave-de-prueba");
    await usuario.click(casilla);
    expect(casilla).toHaveAttribute("aria-checked", "true");

    await usuario.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await esperarTexto("Escriba el código de verificación")).toBeInTheDocument();
    const envio = fetch.mock.calls.find(([url]) => url.endsWith("/auth/paciente/otp/enviar"));
    expect(envio[1].headers["X-Verificacion"]).toBe("token-w1");

    vi.unstubAllEnvs();
    delete window.turnstile;
  });
});

describe("RNF-17: sesión única y cierre real", () => {
  it("si el servidor cierra la sesión, se vuelve al ingreso diciendo por qué", async () => {
    const MOTIVO = "Su sesión se cerró porque se inició sesión con su cuenta en otra pestaña o dispositivo.";
    backendFalso({ "GET /solicitudes": error(401, MOTIVO) });
    abrir("/solicitudes", { paciente: true });
    expect(await esperarTexto(MOTIVO)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ingrese su número de documento" })).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBeNull();
  });

  it("cerrar sesión también la cierra en el servidor", async () => {
    const llamadas = backendFalso({ "GET /solicitudes": [] });
    const usuario = abrir("/solicitudes", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(llamadasA(llamadas, "POST", "/auth/paciente/salir")).toHaveLength(1));
    expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBeNull();
  });

  it.skipIf(typeof BroadcastChannel === "undefined")(
    "si la sesión se abre en otra pestaña, esta se cierra",
    async () => {
      backendFalso({ "GET /solicitudes": [] });
      abrir("/solicitudes", { paciente: true });
      await screen.findByRole("heading", { name: "Solicitar petición" });

      // El aviso se repite hasta que la página ya esté escuchando (con muchas pruebas a la vez, tarda).
      const otraPestana = new BroadcastChannel("saludya-sesion");
      await waitFor(() => {
        otraPestana.postMessage({ tipo: "paciente", pestana: "otra-pestana" });
        expect(screen.getByText(/Se abrió SaludYA con su cuenta en otra pestaña/)).toBeInTheDocument();
      });
      expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBeNull();
      otraPestana.close();
    }
  );

  it("el ingreso del personal muestra por qué se cerró su sesión", () => {
    backendFalso();
    guardarMotivoCierre("personal", "Su cuenta fue modificada por un administrador. Inicie sesión de nuevo.");
    abrir("/admin/ingresar");
    expect(screen.getByText("Su cuenta fue modificada por un administrador. Inicie sesión de nuevo.")).toBeInTheDocument();
  });
});

describe("RNF-24: cierre a los 2 minutos sin actividad", () => {
  it("avisa 30 segundos antes, permite seguir y luego cierra", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const llamadas = backendFalso({ "GET /solicitudes": [] });
    const usuario = abrir("/solicitudes", { paciente: true });
    await screen.findByRole("heading", { name: "Solicitar petición" });

    await act(() => vi.advanceTimersByTimeAsync(80_000));
    expect(screen.queryByText("¿Sigue ahí?")).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(12_000)); // 1:32 sin actividad
    expect(screen.getByText("¿Sigue ahí?")).toBeInTheDocument();

    const antes = llamadasA(llamadas, "GET", "/auth/paciente/me").length;
    await usuario.click(screen.getByRole("button", { name: "Seguir conectado" }));
    await waitFor(() => expect(screen.queryByText("¿Sigue ahí?")).not.toBeInTheDocument());
    expect(llamadasA(llamadas, "GET", "/auth/paciente/me").length).toBeGreaterThan(antes); // el servidor se entera

    await act(() => vi.advanceTimersByTimeAsync(121_000)); // ahora sí, sin actividad
    expect(await esperarTexto(/después de 2 minutos sin actividad/)).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBeNull();
  });

  it("la sesión del personal también se cierra por inactividad", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    backendFalso({ "GET /admin/citas": [], "GET /especialidades": [] });
    abrir("/admin/citas", { personal: true });
    await screen.findByRole("heading", { name: "Gestión de citas" });
    await act(() => vi.advanceTimersByTimeAsync(121_000));
    expect(await esperarTexto(/después de 2 minutos sin actividad/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Iniciar sesión", level: 1 })).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_PERSONAL)).toBeNull();
  });
});
