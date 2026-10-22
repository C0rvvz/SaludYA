import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TOKEN_PACIENTE } from "../src/api/client";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { FRANJAS, OTRA_SEDE, SEDE } from "./datos";

describe("Inicio (rediseño 2a)", () => {
  it("muestra los próximos cupos reales, los accesos y las secciones del menú", async () => {
    backendFalso({ "GET /disponibilidad/buscar": FRANJAS, "GET /sedes": [SEDE, OTRA_SEDE] });
    abrir("/");
    expect(screen.getByRole("heading", { name: "Su cita médica, sin filas ni llamadas." })).toBeInTheDocument();

    // Un cupo por especialidad, el más cercano: Cardiología y Dermatología.
    const carrusel = await screen.findByRole("region", { name: "Próximos cupos disponibles" });
    expect(within(carrusel).getByText("Próximo cupo")).toBeInTheDocument();
    expect(within(carrusel).getAllByRole("button", { name: /Ver cupo/ })).toHaveLength(2);
    expect(within(carrusel).getByText("Cardiología").closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "false");

    // Arriba: "Registrarse" e "Iniciar sesión" (el hero ya no tiene botones).
    expect(screen.getByRole("link", { name: "Registrarse" })).toHaveAttribute("href", "/registrarse");
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/iniciar-sesion");
    expect(screen.getByText("Elija su médico y la hora que le quede mejor. Nosotros le avisamos.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Acceso para personal/ })).toHaveAttribute("href", "/admin/ingresar");

    // El menú lleva a secciones que existen.
    for (const [nombre, destino] of [["Cómo funciona", "como-funciona"], ["Sedes", "sedes"], ["Ayuda", "ayuda"]]) {
      expect(screen.getByRole("link", { name: nombre })).toHaveAttribute("href", `#${destino}`);
      expect(document.getElementById(destino)).toBeInTheDocument();
    }
    expect(await esperarTexto("Sede Laureles")).toBeInTheDocument();
    expect(screen.getByText("¿Necesito una contraseña?")).toBeInTheDocument();
  });

  it("los controles del carrusel cambian el cupo y avanza solo, salvo con el cursor encima", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    backendFalso({ "GET /disponibilidad/buscar": FRANJAS, "GET /sedes": [] });
    const usuario = abrir("/");
    const carrusel = await screen.findByRole("region", { name: "Próximos cupos disponibles" });
    const activa = () => within(carrusel).getByRole("group", { hidden: false }).textContent;

    expect(activa()).toMatch(/Cardiología/);
    await usuario.click(within(carrusel).getByRole("button", { name: "Cupo siguiente" }));
    expect(activa()).toMatch(/Dermatología/);
    await usuario.click(within(carrusel).getByRole("button", { name: "Cupo siguiente" }));
    expect(activa()).toMatch(/Cardiología/); // es cíclico
    await usuario.click(within(carrusel).getByRole("button", { name: "Cupo anterior" }));
    expect(activa()).toMatch(/Dermatología/);
    await usuario.click(within(carrusel).getByRole("button", { name: /Ver cupo 1 de 2/ }));
    expect(activa()).toMatch(/Cardiología/);

    await usuario.unhover(carrusel.querySelector(".inicio-cupo"));
    await act(() => vi.advanceTimersByTimeAsync(5600));
    expect(activa()).toMatch(/Dermatología/); // avanzó solo

    await usuario.hover(carrusel.querySelector(".inicio-cupo"));
    await act(() => vi.advanceTimersByTimeAsync(12_000));
    expect(activa()).toMatch(/Dermatología/); // en pausa con el cursor encima
  });

  it("con sesión, agendar lleva directo a buscar cita", async () => {
    backendFalso({ "GET /disponibilidad/buscar": [], "GET /sedes": [] });
    abrir("/", { paciente: true });
    await waitFor(() => expect(screen.getByRole("link", { name: "Agendar cita" })).toHaveAttribute("href", "/panel"));
  });

  it("sin horarios (o sin backend) no anuncia ningún cupo", async () => {
    const llamadas = backendFalso({ "GET /disponibilidad/buscar": error(500, "caído"), "GET /sedes": error(500, "caído") });
    abrir("/");
    await waitFor(() => expect(llamadas).toHaveLength(2));
    expect(screen.queryByText("Disponible")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Próximos cupos disponibles" })).not.toBeInTheDocument();
    expect(screen.getByText("Las sedes se muestran al elegir la especialidad.")).toBeInTheDocument();
  });
});

describe("Rutas protegidas", () => {
  it("sin sesión, las páginas del paciente llevan a iniciar sesión", async () => {
    backendFalso();
    abrir("/mis-citas");
    expect(await esperarTexto("Ingrese su número de documento")).toBeInTheDocument();
  });

  it("una sesión vencida se limpia", async () => {
    backendFalso({ "GET /auth/paciente/me": error(401, "La sesión expiró.") });
    abrir("/panel", { paciente: true });
    expect(await esperarTexto("Ingrese su número de documento")).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBeNull();
  });
});

describe("Iniciar sesión con código por WhatsApp", () => {
  const rutas = {
    "POST /auth/paciente/identificar": { registrado: true, nombre: "Laura Gómez" },
    "POST /auth/paciente/otp/enviar": { telefono_enmascarado: "******4567", codigo_demo: "123456" },
    "POST /auth/paciente/otp/reenviar": { telefono_enmascarado: "******4567", codigo_demo: "654321" },
    "POST /auth/paciente/otp/validar": ({ cuerpo }) =>
      cuerpo.codigo === "123456" ? { access_token: "token-nuevo" } : error(400, "El código no es correcto."),
    "GET /disponibilidad/buscar": [],
    "GET /especialidades": [],
    "GET /sedes": [],
  };

  it("valida el documento, muestra el código de demostración y entra al panel", async () => {
    const llamadas = backendFalso(rutas);
    const usuario = abrir("/iniciar-sesion");

    await usuario.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(screen.getByText("Ingresa tu número de documento.")).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Número de documento"), "1020304050");
    await usuario.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await esperarTexto("Escriba el código")).toBeInTheDocument();
    expect(screen.getByText("4567")).toBeInTheDocument();
    expect(screen.getAllByText("123456").length).toBeGreaterThan(0); // modo demostración: en el celular de muestra

    await usuario.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByText("Ingresa el código de verificación.")).toBeInTheDocument();

    await usuario.type(screen.getByPlaceholderText("000000"), "99a9999");
    expect(screen.getByPlaceholderText("000000")).toHaveValue("999999"); // solo dígitos
    await usuario.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await esperarTexto("El código no es correcto.")).toBeInTheDocument();

    await usuario.clear(screen.getByPlaceholderText("000000"));
    await usuario.type(screen.getByPlaceholderText("000000"), "123456");
    await usuario.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await esperarTexto("¿Qué especialista busca?")).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBe("token-nuevo");
    expect(llamadasA(llamadas, "POST", "/auth/paciente/otp/validar")).toHaveLength(2);
  });

  it("permite reenviar el código cuando termina la espera", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const llamadas = backendFalso(rutas);
    const usuario = abrir("/iniciar-sesion");
    await usuario.type(screen.getByLabelText("Número de documento"), "1020304050");
    await usuario.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await esperarTexto(/Reenviar en/)).toBeInTheDocument(); // hay que esperar
    expect(screen.queryByRole("button", { name: "Reenviar código" })).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(61_000));
    await usuario.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect((await screen.findAllByText("654321")).length).toBeGreaterThan(0);
    expect(llamadasA(llamadas, "POST", "/auth/paciente/otp/reenviar")).toHaveLength(1);
  });

  it("documento no registrado o error del servidor", async () => {
    backendFalso({ "POST /auth/paciente/identificar": error(404, "No existe") });
    const usuario = abrir("/iniciar-sesion");
    await usuario.selectOptions(screen.getByLabelText("Tipo de documento"), "pasaporte");
    await usuario.type(screen.getByLabelText("Número de documento"), "AV123456");
    await usuario.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await esperarTexto(/No se encontró ningún paciente/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Regístrese aquí" })).toBeInTheDocument();

    backendFalso({ "POST /auth/paciente/identificar": error(500, "Servidor caído") });
    await usuario.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await esperarTexto("Servidor caído")).toBeInTheDocument();
  });

  it("si el reenvío falla se informa", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    backendFalso({ ...rutas, "POST /auth/paciente/otp/reenviar": error(429, "Espere un momento.") });
    const usuario = abrir("/iniciar-sesion");
    await usuario.type(screen.getByLabelText("Número de documento"), "1020304050");
    await usuario.click(screen.getByRole("button", { name: "Enviar código" }));
    await screen.findByText("Escriba el código");
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    await usuario.click(screen.getByRole("button", { name: "Reenviar código" }));
    expect(await esperarTexto("Espere un momento.")).toBeInTheDocument();
  });
});

describe("Registro", () => {
  const EPS = [{ id: "eps-1", nombre: "EPS Sura" }];

  async function llenarPaso1(usuario) {
    await usuario.type(screen.getByLabelText("Número de documento"), "1020304050");
    await usuario.type(screen.getByLabelText("Nombre completo"), "Laura Gómez");
    await usuario.type(screen.getByLabelText("WhatsApp"), "3001234567");
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
  }

  async function llenarPaso2(usuario) {
    await usuario.selectOptions(await screen.findByLabelText("Su EPS"), "eps-1");
    await usuario.click(screen.getByRole("checkbox"));
    await usuario.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
  }

  it("valida, pide la EPS y la autorización, y crea la cuenta", async () => {
    const llamadas = backendFalso({
      "GET /eps": EPS,
      "POST /pacientes/registro": {
        numero_documento: "1020304050",
        eps: EPS[0],
        estado_afiliacion: "activa",
        mensaje: "Registro exitoso.",
      },
    });
    const usuario = abrir("/registrarse");

    await usuario.type(screen.getByLabelText("Correo (opcional)"), "malo@correo");
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Ingresa tu nombre completo.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa un correo electrónico válido.")).toBeInTheDocument();
    await usuario.clear(screen.getByLabelText("Correo (opcional)"));
    expect(screen.queryByText("Ingresa un correo electrónico válido.")).not.toBeInTheDocument();

    await llenarPaso1(usuario);
    expect(screen.getByRole("button", { name: "Crear mi cuenta" })).toBeDisabled();

    await usuario.click(screen.getByRole("button", { name: "tratamiento de mis datos personales" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Ley 1581 de 2012");
    await usuario.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await llenarPaso2(usuario);
    expect(await esperarTexto("¡Registro exitoso, Laura!")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/pacientes/registro")[0].cuerpo).toMatchObject({
      numero_documento: "1020304050",
      correo: null,
      acepto_tratamiento_datos: true,
    });

    await usuario.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await esperarTexto("Ingrese su número de documento")).toBeInTheDocument();
  });

  it("si el documento ya existe vuelve al primer paso y lo marca", async () => {
    backendFalso({ "GET /eps": EPS, "POST /pacientes/registro": error(409, "Ya existe un paciente con ese documento.") });
    const usuario = abrir("/registrarse");
    await llenarPaso1(usuario);
    await llenarPaso2(usuario);
    expect(await esperarTexto("Ya existe un paciente con ese documento.")).toBeInTheDocument();
    expect(screen.getByLabelText("Número de documento")).toHaveAttribute("aria-invalid", "true");
  });

  it("errores de la EPS o generales, y volver al paso anterior", async () => {
    backendFalso({ "GET /eps": EPS, "POST /pacientes/registro": error(404, "No existe esa EPS.") });
    const usuario = abrir("/registrarse");
    await llenarPaso1(usuario);
    await llenarPaso2(usuario);
    expect(await esperarTexto("No existe esa EPS.")).toBeInTheDocument();

    backendFalso({ "POST /pacientes/registro": error(500, "Algo falló.") });
    await usuario.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    expect(await esperarTexto("Algo falló.")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Volver al paso anterior" }));
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Laura Gómez");
  });

  it("la política de datos se cierra con Escape o con un clic afuera, no con un clic adentro", async () => {
    backendFalso({ "GET /eps": EPS });
    const usuario = abrir("/registrarse");
    await llenarPaso1(usuario);
    const abrirPolitica = () => usuario.click(screen.getByRole("button", { name: "tratamiento de mis datos personales" }));

    await abrirPolitica();
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await abrirPolitica();
    await usuario.click(screen.getByRole("heading", { name: "Finalidad del tratamiento" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await usuario.click(document.querySelector(".modal-overlay"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si no carga la lista de EPS lo avisa", async () => {
    backendFalso({ "GET /eps": error(500, "Sin EPS") });
    const usuario = abrir("/registrarse");
    await llenarPaso1(usuario);
    expect(await esperarTexto("Sin EPS")).toBeInTheDocument();
  });
});

describe("Confirmar asistencia desde el enlace del recordatorio", () => {
  const RESPUESTA = {
    especialidad: "Cardiología",
    profesional: "Dr. Carlos Ramírez",
    sede: "Sede Poblado",
    modalidad: "presencial",
    fecha: "2026-10-20",
    hora: "08:00:00",
    ya_estaba_confirmada: false,
  };

  it("confirma con un toque, sin iniciar sesión", async () => {
    const llamadas = backendFalso({ "POST /citas/confirmar-asistencia/enlace": RESPUESTA });
    const usuario = abrir("/confirmar-asistencia?token=abc");
    expect(llamadas).toHaveLength(0); // abrir el enlace no confirma nada
    await usuario.click(screen.getByRole("button", { name: "Sí, asistiré" }));
    expect(await esperarTexto("¡Asistencia confirmada!")).toBeInTheDocument();
    expect(screen.getByText("Dr. Carlos Ramírez")).toBeInTheDocument();
    expect(llamadas[0].cuerpo).toEqual({ token: "abc" });
  });

  it("si ya estaba confirmada, lo dice", async () => {
    backendFalso({ "POST /citas/confirmar-asistencia/enlace": { ...RESPUESTA, ya_estaba_confirmada: true } });
    const usuario = abrir("/confirmar-asistencia?token=abc");
    await usuario.click(screen.getByRole("button", { name: "Sí, asistiré" }));
    expect(await esperarTexto("Su asistencia ya estaba confirmada")).toBeInTheDocument();
  });

  it("muestra los errores del enlace", async () => {
    backendFalso({ "POST /citas/confirmar-asistencia/enlace": error(400, "Este enlace ya venció.") });
    const usuario = abrir("/confirmar-asistencia?token=viejo");
    await usuario.click(screen.getByRole("button", { name: "Sí, asistiré" }));
    expect(await esperarTexto("Este enlace ya venció.")).toBeInTheDocument();
  });

  it("sin token no ofrece confirmar", () => {
    backendFalso();
    abrir("/confirmar-asistencia");
    expect(screen.getByText("Este enlace no es válido.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sí, asistiré" })).not.toBeInTheDocument();
    expect(within(document.body).getByRole("link", { name: "Ingrese a Mis citas" })).toBeInTheDocument();
  });
});
