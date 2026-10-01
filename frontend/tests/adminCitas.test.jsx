import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TOKEN_PERSONAL } from "../src/api/client";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { ESPECIALIDAD, FRANJAS, PERSONAL } from "./datos";

const ACCIONES_TODAS = {
  confirmar: true,
  reprogramar: true,
  cancelar: true,
  recordatorio: true,
  contactar: true,
  registrar_resultado: false,
  observar: true,
};

function citaAdmin(cambios = {}) {
  return {
    id: "ca-1",
    numero_comprobante: "SY-ADM1",
    paciente: { id: "pac-1", nombre: "Mario Ruiz", numero_documento: "1010", telefono_whatsapp: "3009998877" },
    especialidad_id: "esp-1",
    especialidad: "Cardiología",
    especialista: "Dr. Carlos Ramírez",
    sede: "Sede Poblado",
    ciudad: "Medellín",
    modalidad: "presencial",
    fecha: "2026-10-20",
    hora: "08:00:00",
    estado_visible: "pendiente_confirmar",
    estado_texto: "Pendiente de confirmar asistencia",
    canal_recordatorio: "whatsapp",
    recordatorio_enviado_en: null,
    riesgo: { porcentaje: 70, nivel: "alto", factores: ["2 inasistencias recientes"] },
    acciones: ACCIONES_TODAS,
    ...cambios,
  };
}

const REGISTRO = {
  id: "r1",
  fecha: "2026-10-01T09:00:00-05:00",
  actor_tipo: "personal",
  actor_nombre: "Ana Admin (Administrador)",
  accion: "recordatorio",
  descripcion: "Envió un recordatorio manual por WhatsApp",
  detalle: "Sin señal",
  cita_id: "ca-1",
  numero_comprobante: "SY-ADM1",
  paciente_nombre: "Mario Ruiz",
  estado_anterior: "Pendiente",
  estado_nuevo: "Confirmada",
};

function detalle(cambios = {}) {
  return {
    ...citaAdmin(),
    paciente: {
      id: "pac-1",
      nombre: "Mario Ruiz",
      tipo_documento: "cedula_ciudadania",
      numero_documento: "1010",
      telefono_whatsapp: "3009998877",
      correo: null,
      eps: "EPS Sura",
      estado_afiliacion: "no_encontrada",
    },
    motivo_cancelacion: null,
    historial_estado: [],
    historial_asistencia: [
      { id: "ca-0", fecha: "2026-09-01", especialidad: "Cardiología", estado_visible: "no_asistio", estado_texto: "No asistió" },
    ],
    resumen_asistencia: { atendidas: 1, no_asistio: 2, canceladas: 0, reprogramadas: 0 },
    recordatorios: [REGISTRO],
    contactos: [],
    observaciones: [
      { id: "o1", texto: "Prefiere la tarde.", autor: "Ana Admin (Administrador)", numero_comprobante: "SY-ADM1", creado_en: "2026-10-01T09:00:00-05:00" },
    ],
    auditoria: [REGISTRO],
    ...cambios,
  };
}

describe("Ingreso del personal", () => {
  it("inicia sesión y ve solo las secciones de su rol", async () => {
    const AGENDAMIENTO = { ...PERSONAL, rol: "agendamiento", rol_texto: "Agendamiento", permisos: ["ver_citas", "gestionar_citas", "observaciones"] };
    const llamadas = backendFalso({
      "POST /admin/auth/login": ({ cuerpo }) =>
        cuerpo.password === "clave-correcta"
          ? { access_token: "tk-personal", personal: AGENDAMIENTO }
          : error(401, "Correo o contraseña incorrectos."),
      "GET /admin/citas": [],
      "GET /especialidades": [ESPECIALIDAD],
    });
    const usuario = abrir("/admin/ingresar");
    await usuario.type(screen.getByLabelText("Correo institucional"), "agenda@saludya.co");
    await usuario.type(screen.getByLabelText("Contraseña"), "mala");
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await esperarTexto("Correo o contraseña incorrectos.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toHaveValue(""); // se borra la contraseña

    await usuario.type(screen.getByLabelText("Contraseña"), "clave-correcta");
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByRole("heading", { name: "Gestión de citas" })).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_PERSONAL)).toBe("tk-personal");

    const menu = screen.getByRole("navigation", { name: "Secciones de administración" });
    expect(within(menu).queryByText("Reportes")).not.toBeInTheDocument();
    expect(within(menu).queryByText("Usuarios")).not.toBeInTheDocument();
    expect(within(menu).getByText("Centro de recordatorios")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/auth/login")[1].cuerpo).toEqual({
      correo: "agenda@saludya.co",
      password: "clave-correcta",
    });

    await usuario.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByRole("heading", { name: "Ingreso del personal de la EPS o IPS" })).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_PERSONAL)).toBeNull();
  });

  it("con sesión activa, el ingreso redirige; sin permiso, la sección se bloquea", async () => {
    backendFalso({
      "GET /admin/auth/me": { ...PERSONAL, permisos: ["ver_citas"] },
      "GET /admin/citas": [],
      "GET /especialidades": [],
    });
    abrir("/admin/ingresar", { personal: true });
    expect(await screen.findByRole("heading", { name: "Gestión de citas" })).toBeInTheDocument();

    abrir("/admin/usuarios", { personal: true });
    expect(await esperarTexto("Su rol no tiene acceso a esta sección.")).toBeInTheDocument();
  });

  it("sin sesión, o con la sesión vencida, pide ingresar", async () => {
    backendFalso();
    abrir("/admin/citas");
    expect(await screen.findByRole("heading", { name: "Ingreso del personal de la EPS o IPS" })).toBeInTheDocument();

    backendFalso({ "GET /admin/auth/me": error(401, "Su cuenta no está activa.") });
    abrir("/admin", { personal: true });
    expect(await screen.findByRole("heading", { name: "Ingreso del personal de la EPS o IPS" })).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_PERSONAL)).toBeNull();
  });
});

describe("Gestión de citas", () => {
  it("lista con riesgo, filtros y acciones rápidas", async () => {
    let citas = [citaAdmin(), citaAdmin({ id: "ca-2", riesgo: null, recordatorio_enviado_en: "2026-10-01T08:00:00-05:00",
      acciones: { ...ACCIONES_TODAS, confirmar: false, recordatorio: false } })];
    const llamadas = backendFalso({
      "GET /admin/citas": () => citas,
      "GET /especialidades": [ESPECIALIDAD],
      "POST /admin/citas/:id/confirmar": () => {
        citas = [citaAdmin({ acciones: { ...ACCIONES_TODAS, confirmar: false } })];
        return detalle();
      },
      "POST /admin/citas/:id/recordatorio": error(502, "No se pudo enviar el recordatorio."),
    });
    const usuario = abrir("/admin", { personal: true });

    expect(await esperarTexto("2 citas · 1 con riesgo alto de inasistencia")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "70% estimado de inasistencia" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Llamar a Mario Ruiz" })[0]).toHaveAttribute("href", "tel:3009998877");

    await usuario.click(screen.getByRole("button", { name: "Recordatorio" }));
    expect(await esperarTexto("No se pudo enviar el recordatorio.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await esperarTexto("Asistencia de Mario Ruiz confirmada.")).toBeInTheDocument();
    expect(await esperarTexto("1 cita · 1 con riesgo alto de inasistencia")).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Paciente, documento o comprobante"), "Mario");
    await usuario.selectOptions(screen.getByLabelText("Especialidad"), "esp-1");
    await usuario.selectOptions(screen.getByLabelText("Estado"), "cancelada");
    await usuario.type(screen.getByLabelText("Hasta"), "2026-12-31");
    await usuario.clear(screen.getByLabelText("Desde"));
    citas = [];
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await esperarTexto("No hay citas con esos filtros.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "GET", "/admin/citas").at(-1).query).toEqual({
      buscar: "Mario",
      hasta: "2026-12-31",
      especialidad_id: "esp-1",
      estado: "cancelada",
    });
  });

  it("si la lista no carga, lo dice", async () => {
    backendFalso({ "GET /admin/citas": error(500, "No cargó"), "GET /especialidades": error(500, "x") });
    abrir("/admin/citas", { personal: true });
    expect(await esperarTexto("No cargó")).toBeInTheDocument();
  });
});

describe("Detalle de una cita para el personal", () => {
  it("muestra paciente, historial, riesgo, recordatorios y auditoría", async () => {
    backendFalso({ "GET /admin/citas/:id": detalle() });
    abrir("/admin/citas/ca-1", { personal: true });
    expect(await screen.findByRole("heading", { name: "Mario Ruiz" })).toBeInTheDocument();
    expect(screen.getByText("CC 1010")).toBeInTheDocument();
    expect(screen.getByText("No encontrada")).toBeInTheDocument();
    expect(screen.getByText("2 inasistencias recientes")).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente → Confirmada")).toHaveLength(2);
    expect(screen.getAllByText("“Sin señal”")).toHaveLength(2);
    expect(screen.getByText("No se han registrado llamadas.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cardiología/ })).toHaveAttribute("href", "/admin/citas/ca-0");
  });

  it("confirmar, enviar recordatorio, llamar, cancelar y registrar la atención", async () => {
    const llamadas = backendFalso({
      "GET /admin/citas/:id": detalle({ acciones: { ...ACCIONES_TODAS, registrar_resultado: true } }),
      "POST /admin/citas/:id/confirmar": detalle({ acciones: { ...ACCIONES_TODAS, registrar_resultado: true } }),
      "POST /admin/citas/:id/recordatorio": error(502, "No se pudo enviar."),
      "POST /admin/citas/:id/contacto": detalle({ acciones: { ...ACCIONES_TODAS, registrar_resultado: true } }),
      "POST /admin/citas/:id/cancelar": detalle({ estado_visible: "cancelada", estado_texto: "Cancelada",
        acciones: { ...ACCIONES_TODAS, confirmar: false, cancelar: false, reprogramar: false, recordatorio: false, registrar_resultado: true } }),
      "POST /admin/citas/:id/resultado": detalle({ estado_visible: "atendida", estado_texto: "Atendida",
        acciones: { contactar: false, confirmar: false, reprogramar: false, cancelar: false, recordatorio: false, registrar_resultado: false, observar: false } }),
    });
    const usuario = abrir("/admin/citas/ca-1", { personal: true });

    await usuario.click(await screen.findByRole("button", { name: "Confirmar asistencia" }));
    expect(await esperarTexto("Asistencia confirmada.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Enviar recordatorio" }));
    expect(await esperarTexto("No se pudo enviar.")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Llamar al paciente" }));
    expect(screen.getByRole("link", { name: "Llamar ahora" })).toHaveAttribute("href", "tel:3009998877");
    await usuario.selectOptions(screen.getByLabelText("Resultado de la llamada"), "buzon_de_voz");
    await usuario.type(screen.getByLabelText("Nota (opcional)"), "Dejé mensaje");
    await usuario.click(screen.getByRole("button", { name: "Registrar llamada" }));
    expect(await esperarTexto("Llamada registrada.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/citas/ca-1/contacto")[0].cuerpo).toEqual({
      resultado: "buzon_de_voz",
      nota: "Dejé mensaje",
    });

    await usuario.click(screen.getByRole("button", { name: "Cancelar cita" }));
    await usuario.click(screen.getByRole("button", { name: "No, volver" }));
    await usuario.click(screen.getByRole("button", { name: "Cancelar cita" }));
    await usuario.type(screen.getByLabelText("Motivo (opcional)"), "  Llamó a cancelar ");
    await usuario.click(screen.getByRole("button", { name: "Sí, cancelar la cita" }));
    expect(await esperarTexto("Cita cancelada y cupo liberado.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/citas/ca-1/cancelar")[0].cuerpo).toEqual({ motivo: "Llamó a cancelar" });

    await usuario.click(screen.getByRole("button", { name: "Registrar atención" }));
    await usuario.click(screen.getByRole("button", { name: "Volver" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar atención" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, fue atendido" }));
    expect(await esperarTexto("Se registró que el paciente fue atendido.")).toBeInTheDocument();
    expect(screen.getByText(/No hay acciones disponibles/)).toBeInTheDocument();
  });

  it("registrar que no asistió", async () => {
    const ATENDIDA = detalle({ estado_visible: "atendida", estado_texto: "Atendida",
      acciones: { ...ACCIONES_TODAS, confirmar: false, reprogramar: false, cancelar: false, recordatorio: false, registrar_resultado: true } });
    backendFalso({
      "GET /admin/citas/:id": ATENDIDA,
      "POST /admin/citas/:id/resultado": ({ cuerpo }) => ({ ...ATENDIDA, estado_visible: cuerpo.resultado, estado_texto: "No asistió" }),
    });
    const usuario = abrir("/admin/citas/ca-1", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Registrar atención" }));
    expect(screen.getByRole("button", { name: "Sí, fue atendido" })).toBeDisabled();
    await usuario.click(screen.getByRole("button", { name: "No asistió" }));
    expect(await esperarTexto("Se registró que el paciente no asistió.")).toBeInTheDocument();
  });

  it("reprogramar lleva al detalle de la cita nueva", async () => {
    const NUEVA = detalle({ id: "ca-9", numero_comprobante: "SY-NUEVO", hora: "10:00:00" });
    const llamadas = backendFalso({
      "GET /admin/citas/ca-1": detalle(),
      "GET /admin/citas/ca-9": NUEVA,
      "GET /disponibilidad/buscar": FRANJAS.slice(0, 2),
      "POST /admin/citas/:id/reprogramar": NUEVA,
    });
    const usuario = abrir("/admin/citas/ca-1", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Reprogramar" }));
    await usuario.click(await screen.findByRole("button", { name: /10:00/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, cambiar la cita" }));
    expect(await esperarTexto("Cita reprogramada. Nuevo comprobante: SY-NUEVO.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin/citas/ca-9");
    expect(llamadasA(llamadas, "POST", "/admin/citas/ca-1/reprogramar")[0].cuerpo).toEqual({ disponibilidad_id: "f2" });
  });

  it("si reprogramar falla, lo dice", async () => {
    backendFalso({
      "GET /admin/citas/:id": detalle(),
      "GET /disponibilidad/buscar": FRANJAS.slice(0, 1),
      "POST /admin/citas/:id/reprogramar": error(409, "Ese horario ya no está disponible."),
    });
    const usuario = abrir("/admin/citas/ca-1", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Reprogramar" }));
    await usuario.click(await screen.findByRole("button", { name: /8:00/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, cambiar la cita" }));
    expect(await esperarTexto("Ese horario ya no está disponible.")).toBeInTheDocument();
  });

  it("agregar observaciones", async () => {
    const llamadas = backendFalso({
      "GET /admin/citas/:id": detalle(),
      "POST /admin/pacientes/:id/observaciones": { id: "o2" },
    });
    const usuario = abrir("/admin/citas/ca-1", { personal: true });
    const guardar = await screen.findByRole("button", { name: "Guardar observación" });
    expect(guardar).toBeDisabled();
    await usuario.type(screen.getByLabelText(/Nueva observación/), "  Llamar en la tarde  ");
    await usuario.click(guardar);
    expect(await esperarTexto("Observación guardada.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/pacientes/pac-1/observaciones")[0].cuerpo).toEqual({
      texto: "Llamar en la tarde",
      cita_id: "ca-1",
    });

    backendFalso({ "GET /admin/citas/:id": detalle(), "POST /admin/pacientes/:id/observaciones": error(404, "Esa cita no es de este paciente.") });
    await usuario.type(screen.getByLabelText(/Nueva observación/), "Otra");
    await usuario.click(screen.getByRole("button", { name: "Guardar observación" }));
    expect(await esperarTexto("Esa cita no es de este paciente.")).toBeInTheDocument();
  });

  it("recordatorio antiguo, única cita y cita inexistente", async () => {
    backendFalso({
      "GET /admin/citas/:id": detalle({
        recordatorios: [], auditoria: [], historial_asistencia: [], riesgo: null,
        recordatorio_enviado_en: "2026-09-30T08:00:00-05:00",
        paciente: { ...detalle().paciente, correo: "mario@correo.co", eps: null, tipo_documento: "otro" },
      }),
    });
    abrir("/admin/citas/ca-1", { personal: true });
    expect(await esperarTexto(/Último recordatorio enviado el/)).toBeInTheDocument();
    expect(screen.getByText("Es la única cita de este paciente.")).toBeInTheDocument();
    expect(screen.getByText("Sin registros.")).toBeInTheDocument();
    expect(screen.getByText("otro 1010")).toBeInTheDocument();

    backendFalso({ "GET /admin/citas/:id": error(404, "No existe esa cita.") });
    abrir("/admin/citas/nada", { personal: true });
    expect(await esperarTexto("No existe esa cita.")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "← Volver a gestión de citas" })).toBeInTheDocument();
  });
});
