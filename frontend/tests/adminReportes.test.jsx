import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { PERSONAL } from "./datos";

function reporte(cambios = {}) {
  return {
    periodo: "mes",
    periodo_texto: "Este mes",
    desde: "2026-10-01",
    hasta: "2026-10-31",
    hoy: {
      fecha: "2026-10-01",
      programadas: 8,
      confirmadas: 5,
      pendientes: 3,
      canceladas: 1,
      horarios_liberados: 2,
      horarios_reasignados: 1,
      inasistencia_estimada: 35,
    },
    citas: 40,
    en_lista_espera: 6,
    confirmadas: 20,
    sin_confirmar: 10,
    porcentaje_confirmadas: 66.7,
    canceladas: 4,
    canceladas_a_tiempo: 3,
    atendidas: 9,
    no_asistio: 3,
    porcentaje_inasistencia: 25,
    cupos_liberados: 5,
    cupos_reasignados: 2,
    minutos_promedio_reasignacion: 200,
    canales: [
      { canal: "whatsapp", cantidad: 30 },
      { canal: "sms", cantidad: 6 },
      { canal: "correo", cantidad: 4 },
      { canal: "llamada", cantidad: 0 },
    ],
    demanda: [
      { nombre: "Cardiología", cantidad: 25 },
      { nombre: "Dermatología", cantidad: 15 },
    ],
    inasistencia_por_especialidad: [
      { especialidad: "Dermatología", atendidas: 2, no_asistio: 2, porcentaje: 50 },
      { especialidad: "Cardiología", atendidas: 7, no_asistio: 1, porcentaje: 12.5 },
    ],
    inasistencia_por_paciente: [
      { paciente_id: "p1", nombre: "Mario Ruiz", numero_documento: "1010", no_asistio: 2, citas: 3, cita_id: "c9" },
    ],
    tendencia: [
      { etiqueta: "Semana del 1 de octubre", desde: "2026-10-01", hasta: "2026-10-04", atendidas: 3, no_asistio: 1, porcentaje: 25 },
      { etiqueta: "Semana del 5 de octubre", desde: "2026-10-05", hasta: "2026-10-11", atendidas: 6, no_asistio: 2, porcentaje: 25 },
    ],
    tendencia_direccion: "se_mantiene",
    satisfaccion: {
      calificaciones: 3,
      promedio: 4.3,
      porcentaje_satisfechos: 66.7,
      distribucion: [
        { calificacion: 5, cantidad: 2 },
        { calificacion: 4, cantidad: 0 },
        { calificacion: 3, cantidad: 0 },
        { calificacion: 2, cantidad: 1 },
        { calificacion: 1, cantidad: 0 },
      ],
    },
    solicitudes: {
      recibidas: 4,
      formales: 3,
      derechos_peticion: 1,
      pendientes_revision: 1,
      prioritarias_aprobadas: 1,
      pendientes_eps: 1,
      minutos_promedio_revision: 45,
      citas_asignadas: 2,
    },
    ...cambios,
  };
}

const VACIO = reporte({
  inasistencia_por_paciente: [],
  tendencia_direccion: null,
  cupos_reasignados: 0,
  minutos_promedio_reasignacion: null,
  demanda: [{ nombre: "Cardiología", cantidad: 0 }],
  canales: [{ canal: "whatsapp", cantidad: 0 }],
  inasistencia_por_especialidad: [{ especialidad: "Cardiología", atendidas: 0, no_asistio: 0, porcentaje: null }],
  satisfaccion: { calificaciones: 0, promedio: null, porcentaje_satisfechos: null, distribucion: [] },
});

describe("Dashboard", () => {
  it("resume el día y el periodo, y cambia de periodo", async () => {
    const llamadas = backendFalso({
      "GET /admin/reportes": ({ query }) => (query.periodo === "anio" ? reporte({ periodo_texto: "Este año", citas: 400 }) : reporte()),
    });
    const usuario = abrir("/admin/dashboard", { personal: true });
    expect(await esperarTexto("Hoy, Jueves, 1 de octubre")).toBeInTheDocument();
    expect(screen.getByText("35 %")).toBeInTheDocument();
    expect(screen.getByText("3 formales · 1 derechos de petición")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver historial" })).toHaveAttribute("href", "/admin/citas/c9");

    await usuario.selectOptions(screen.getByLabelText("Periodo"), "anio");
    expect(await esperarTexto("Resumen de este año")).toBeInTheDocument();
    expect(screen.getByText("400")).toBeInTheDocument();
    expect(llamadasA(llamadas, "GET", "/admin/reportes").map((l) => l.query.periodo)).toEqual(["mes", "anio"]);
  });

  it("sin inasistencias por paciente, o si el reporte falla", async () => {
    backendFalso({ "GET /admin/reportes": VACIO });
    abrir("/admin/dashboard", { personal: true });
    expect(await esperarTexto("Ningún paciente ha faltado a una cita en este periodo.")).toBeInTheDocument();

    backendFalso({ "GET /admin/reportes": error(500, "Reporte no disponible") });
    abrir("/admin/dashboard", { personal: true });
    expect(await esperarTexto("Reporte no disponible")).toBeInTheDocument();
  });
});

describe("Reportes", () => {
  it("indicadores, satisfacción (HU-71), demanda, inasistencia, canales y tendencia", async () => {
    backendFalso({ "GET /admin/reportes": reporte() });
    abrir("/admin/reportes", { personal: true });
    expect(await esperarTexto("Indicadores de citas: este mes")).toBeInTheDocument();
    expect(screen.getByText("3 de 12 citas ya cerradas")).toBeInTheDocument();
    expect(screen.getByText("3 h 20 min")).toBeInTheDocument();

    const satisfaccion = screen.getByRole("heading", { name: "Satisfacción de los pacientes" }).closest("section");
    expect(within(satisfaccion).getByText("4,3 de 5")).toBeInTheDocument();
    expect(within(satisfaccion).getByText("Buena")).toBeInTheDocument();
    expect(within(satisfaccion).getByText("3 de 9")).toBeInTheDocument();
    expect(within(satisfaccion).getByText("5 ★ Excelente").closest("li")).toHaveClass("is-mayor");

    expect(screen.getByText("Cardiología", { selector: ".reporte__destacado strong" })).toBeInTheDocument();
    expect(screen.getByText("Dermatología", { selector: ".reporte__destacado strong" })).toBeInTheDocument();
    expect(screen.getByText("WhatsApp", { selector: ".reporte__destacado strong" })).toBeInTheDocument();
    expect(screen.getByText(/se mantuvo igual/)).toBeInTheDocument();
  });

  it("sin datos en el periodo", async () => {
    backendFalso({ "GET /admin/reportes": VACIO });
    abrir("/admin/reportes", { personal: true });
    expect(await esperarTexto(/Aún no hay calificaciones en este periodo/)).toBeInTheDocument();
    expect(screen.getAllByText("Sin datos en este periodo.")).toHaveLength(3);
    expect(screen.getByText(/Aún no hay datos suficientes/)).toBeInTheDocument();
    expect(screen.getByText(/Aún no se ha reasignado ningún cupo/)).toBeInTheDocument();
  });

  it.each([
    ["aumenta", /aumentó/],
    ["disminuye", /disminuyó/],
  ])("tendencia que %s", async (direccion, texto) => {
    backendFalso({ "GET /admin/reportes": reporte({ tendencia_direccion: direccion }) });
    abrir("/admin/reportes", { personal: true });
    expect(await esperarTexto(texto)).toBeInTheDocument();
  });
});

describe("Auditoría", () => {
  const REGISTROS = [
    {
      id: "a1", fecha: "2026-10-01T09:00:00-05:00", actor_tipo: "personal", actor_nombre: "Ana Admin (Administrador)",
      accion: "cancelar", descripcion: "Canceló la cita", detalle: "Llamó", cita_id: "c1", numero_comprobante: "SY-1",
      paciente_nombre: "Mario Ruiz", estado_anterior: "Pendiente", estado_nuevo: "Cancelada",
    },
    {
      id: "a2", fecha: "2026-10-01T08:00:00-05:00", actor_tipo: "sistema", actor_nombre: "Sistema",
      accion: "ofrecer_cupo", descripcion: "Ofreció un cupo", detalle: null, cita_id: null, numero_comprobante: null,
      paciente_nombre: null, estado_anterior: null, estado_nuevo: null,
    },
  ];

  it("filtra por texto, responsable y acción", async () => {
    const llamadas = backendFalso({ "GET /admin/auditoria": ({ query }) => (query.accion ? REGISTROS.slice(0, 1) : REGISTROS) });
    const usuario = abrir("/admin/auditoria", { personal: true });
    expect(await esperarTexto("Canceló la cita")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SY-1" })).toHaveAttribute("href", "/admin/citas/c1");
    expect(screen.getByText("“Llamó”")).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText("Responsable"), "sistema");
    expect(screen.queryByText("Canceló la cita")).not.toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Responsable"), "");
    await usuario.type(screen.getByLabelText("Buscar"), "mario");
    expect(screen.queryByText("Ofreció un cupo")).not.toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Buscar"), " xyz");
    expect(screen.getByText("No hay registros con esos filtros.")).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText("Acción"), "cancelar");
    expect(llamadasA(llamadas, "GET", "/admin/auditoria").at(-1).query).toEqual({ accion: "cancelar" });
  });

  it("si no carga, lo dice", async () => {
    backendFalso({ "GET /admin/auditoria": error(403, "No tiene permiso.") });
    abrir("/admin/auditoria", { personal: true });
    expect(await esperarTexto("No tiene permiso.")).toBeInTheDocument();
  });
});

describe("Usuarios del personal", () => {
  const OTRO = { ...PERSONAL, id: "per-2", nombre: "Carlos Agenda", correo: "carlos@saludya.co", rol: "agendamiento", ultimo_acceso_en: null };

  it("crear, cambiar rol, desactivar y cambiar contraseña", async () => {
    const llamadas = backendFalso({
      "GET /admin/usuarios": [PERSONAL, OTRO, { ...OTRO, id: "per-3", nombre: "Inactiva", activo: false }],
      "POST /admin/usuarios": { id: "per-4" },
      "PATCH /admin/usuarios/:id": ({ cuerpo }) => (cuerpo.password === "corta-pero-10" ? error(400, "No permitido.") : {}),
    });
    const usuario = abrir("/admin/usuarios", { personal: true });

    expect(await screen.findByLabelText("Rol de Ana Admin")).toBeDisabled(); // no cambia su propio rol
    expect(screen.getAllByText("Nunca", { selector: "td" })).toHaveLength(2); // nunca han ingresado

    await usuario.type(screen.getByLabelText("Nombre"), "Nueva Persona");
    await usuario.type(screen.getByLabelText("Correo institucional"), "nueva@saludya.co");
    await usuario.selectOptions(screen.getByLabelText("Rol"), "call_center");
    await usuario.type(screen.getByLabelText(/Contraseña inicial/), "clave-larga-123");
    await usuario.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await esperarTexto("Cuenta creada para Nueva Persona.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("");

    await usuario.selectOptions(screen.getByLabelText("Rol de Carlos Agenda"), "coordinador_medico");
    expect(await esperarTexto("Rol de Carlos Agenda actualizado.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Desactivar" }));
    expect(await esperarTexto("Cuenta de Carlos Agenda desactivada.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Activar" }));
    expect(await esperarTexto("Cuenta de Inactiva activada.")).toBeInTheDocument();

    await usuario.click(screen.getAllByRole("button", { name: "Cambiar contraseña" })[1]);
    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));
    await usuario.click(screen.getAllByRole("button", { name: "Cambiar contraseña" })[1]);
    const guardar = screen.getByRole("button", { name: "Guardar" });
    expect(guardar).toBeDisabled();
    await usuario.type(screen.getByLabelText("Nueva contraseña de Carlos Agenda"), "corta-pero-10");
    await usuario.click(guardar);
    expect(await esperarTexto("No permitido.")).toBeInTheDocument();
    await usuario.clear(screen.getByLabelText("Nueva contraseña de Carlos Agenda"));
    await usuario.type(screen.getByLabelText("Nueva contraseña de Carlos Agenda"), "otra-clave-larga");
    await usuario.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await esperarTexto("Contraseña de Carlos Agenda actualizada.")).toBeInTheDocument();

    const patch = llamadasA(llamadas, "PATCH", "/admin/usuarios/per-2").map((l) => l.cuerpo);
    expect(patch).toEqual([{ rol: "coordinador_medico" }, { activo: false }, { password: "corta-pero-10" }, { password: "otra-clave-larga" }]);
  });

  it("si la lista no carga, lo dice", async () => {
    backendFalso({ "GET /admin/usuarios": error(500, "Sin usuarios") });
    abrir("/admin/usuarios", { personal: true });
    expect(await esperarTexto("Sin usuarios")).toBeInTheDocument();
  });
});

describe("Lista de solicitudes del personal", () => {
  const SOLICITUDES = [
    { id: "s1", numero_radicado: "RAD-1", tipo: "formal", tipo_cita: "primera_vez", especialidad: "Cardiología",
      fecha_deseada: "2026-10-30", radicada_en: "2026-10-01T09:00:00-05:00", estado: "pendiente", prioritaria: false, paciente_nombre: "Mario Ruiz" },
    { id: "s2", numero_radicado: "RAD-2", tipo: "derecho_peticion", tipo_cita: "control", especialidad: "Dermatología",
      fecha_deseada: "2026-11-02", radicada_en: "2026-09-30T09:00:00-05:00", estado: "aprobada", prioritaria: true, paciente_nombre: "Laura Gómez" },
  ];

  it("cuenta por estado, filtra y lleva a la revisión", async () => {
    backendFalso({ "GET /admin/solicitudes": SOLICITUDES });
    const usuario = abrir("/admin/solicitudes", { personal: true });
    expect(await esperarTexto("RAD-1")).toBeInTheDocument();
    expect(screen.getByText("Prioritaria")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Ver contexto" })[0]).toHaveAttribute("href", "/admin/solicitudes/s1");

    await usuario.selectOptions(screen.getByLabelText("Estado"), "aprobada");
    expect(screen.queryByText("RAD-1")).not.toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Estado"), "negada");
    expect(screen.getByText("No hay solicitudes con ese estado.")).toBeInTheDocument();
  });

  it("si no cargan, lo dice", async () => {
    backendFalso({ "GET /admin/solicitudes": error(500, "Sin solicitudes") });
    abrir("/admin/solicitudes", { personal: true });
    expect(await esperarTexto("Sin solicitudes")).toBeInTheDocument();
  });
});
