/**
 * Backend falso para las pruebas: responde a fetch() según "MÉTODO /ruta"
 * (con :parámetros), y abre la app completa en una ruta, como un
 * navegador. Así cada prueba recorre la pantalla real con su API real.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import App from "../src/App";
import { TOKEN_PACIENTE, TOKEN_PERSONAL } from "../src/api/client";
import { PACIENTE, PERSONAL } from "./datos";

class Respuesta {
  constructor(status, cuerpo) {
    this.status = status;
    this.cuerpo = cuerpo;
  }
}

/** Respuesta de error del backend: {"detail": ...} */
export const error = (status, detail) => new Respuesta(status, { detail });

function coincide(patron, ruta) {
  const partes = patron.split("/");
  const reales = ruta.split("/");
  if (partes.length !== reales.length) return null;
  const params = {};
  for (let i = 0; i < partes.length; i++) {
    if (partes[i].startsWith(":")) params[partes[i].slice(1)] = reales[i];
    else if (partes[i] !== reales[i]) return null;
  }
  return params;
}

/**
 * `rutas`: { "GET /citas": datos | (pedido) => datos | error(...) }.
 * Devuelve las llamadas recibidas, para revisar qué se envió.
 */
export function backendFalso(rutas = {}) {
  const llamadas = [];
  const todas = {
    "GET /auth/paciente/me": PACIENTE,
    "GET /admin/auth/me": PERSONAL,
    "GET /chat": [],
    ...rutas,
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, opciones) => {
      const { pathname, searchParams } = new URL(url);
      const metodo = opciones.method;
      const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
      llamadas.push({ metodo, ruta: pathname, query: Object.fromEntries(searchParams), cuerpo });

      let encontrado = false;
      let manejador;
      let params = {};
      for (const [clave, valor] of Object.entries(todas)) {
        const [m, patron] = clave.split(" ");
        const encontrados = m === metodo && coincide(patron, pathname);
        if (encontrados) {
          encontrado = true;
          manejador = valor;
          params = encontrados;
          break;
        }
      }
      let resultado =
        !encontrado
          ? error(404, `Sin datos de prueba para ${metodo} ${pathname}`)
          : manejador === undefined
            ? new Respuesta(204, undefined) // sin cuerpo
          : typeof manejador === "function"
            ? await manejador({ cuerpo, params, query: Object.fromEntries(searchParams) })
            : manejador;
      if (!(resultado instanceof Respuesta)) resultado = new Respuesta(200, resultado);
      return {
        ok: resultado.status < 400,
        status: resultado.status,
        json: () =>
          resultado.cuerpo === undefined ? Promise.reject(new SyntaxError("vacío")) : Promise.resolve(resultado.cuerpo),
      };
    })
  );
  return llamadas;
}

/** Abre la app en `ruta`, con la sesión del paciente y/o del personal si se pide. */
export function abrir(ruta, { paciente = false, personal = false } = {}) {
  cleanup(); // si la prueba ya había abierto la app, se cierra primero
  if (paciente) localStorage.setItem(TOKEN_PACIENTE, "token-paciente");
  if (personal) localStorage.setItem(TOKEN_PERSONAL, "token-personal");
  window.history.pushState({}, "", ruta);
  const usuario = userEvent.setup();
  render(<App />);
  return usuario;
}

/** Espera a que aparezca un texto (las pantallas cargan sus datos al abrir). */
export const esperarTexto = (texto, opciones) => screen.findByText(texto, opciones);

/** Llamadas a una ruta y método. */
export const llamadasA = (llamadas, metodo, ruta) => llamadas.filter((l) => l.metodo === metodo && l.ruta === ruta);
