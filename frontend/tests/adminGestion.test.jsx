import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { FRANJAS, PERSONAL } from "./datos";

// --- Revisión clínica (HU-78, HU-79) ---

function revision(cambios = {}, cambiosSolicitud = {}) {
  return {
    solicitud: {
      id: "s1",
      numero_radicado: "RAD-1",
      tipo: "derecho_peticion",
      especialidad_id: "esp-1",
      especialidad: "Cardiología",
      tipo_cita: "primera_vez",
      fecha_deseada: "2026-10-21",
      motivo: "Dolor persistente.",
      canal: "whatsapp",
      estado: "pendiente",
      radicada_en: "2026-10-01T09:00:00-05:00",
      revisada_en: null,
      revisor: null,
      prioritaria: false,
      respuesta: null,
      enviada_eps_en: null,
      respuesta_eps_en: null,
      paciente_id: "pac-1",
      paciente_nombre: "Mario Ruiz",
      cita: null,
      ...cambiosSolicitud,
    },
    paciente: {
      id: "pac-1",
      nombre: "Mario Ruiz",
      tipo_documento: "CC",
      numero_documento: "1010",
      telefono_whatsapp: "3009998877",
      correo: null,
      eps: null,
      estado_afiliacion: "activa",
    },
    historial: [{ id: "c0", fecha: "2026-09-01", especialidad: "Cardiología", estado_visible: "no_asistio", estado_texto: "No asistió" }],
    resumen_asistencia: { atendidas: 0, no_asistio: 1, canceladas: 0, reprogramadas: 0 },
    observaciones: [{ id: "o1", texto: "Paciente mayor.", autor: "Ana", creado_en: "2026-10-01T09:00:00-05:00" }],
    en_lista_espera: ["Cardiología"],
    ...cambios,
  };
}

describe("Revisión clínica", () => {
  it("muestra el contexto y aprueba asignando un horario desde la fecha pedida", async () => {
    const APROBADA = revision({}, {
      estado: "aprobada", prioritaria: true, revisor: "Ana Admin", revisada_en: "2026-10-01T10:00:00-05:00",
      respuesta: "Aprobada.", cita: { id: "c9", fecha: "2026-10-21", hora: "15:00:00", especialista: "Dr. Carlos Ramírez" },
    });
    const llamadas = backendFalso({
      "GET /admin/solicitudes/:id": revision(),
      "GET /disponibilidad/buscar": FRANJAS,
      "POST /admin/solicitudes/:id/aprobar": APROBADA,
    });
    const usuario = abrir("/admin/solicitudes/s1", { personal: true });
    expect(await esperarTexto("Dolor persistente.")).toBeInTheDocument();
    expect(screen.getByText("Paciente mayor.")).toBeInTheDocument();
    expect(screen.getAllByText("Cardiología", { selector: ".summary-row__value" })).toHaveLength(2); // especialidad y lista de espera

    await usuario.click(screen.getByRole("button", { name: "Aprobar y asignar cita" }));
    const panel = (await screen.findByRole("heading", { name: "Aprobar y asignar la cita" })).closest(".card");
    // Solo desde la fecha solicitada (21 de octubre): no aparece el del 20.
    expect(within(panel).queryByText(/Martes, 20 de octubre/)).not.toBeInTheDocument();
    await usuario.click(within(panel).getByLabelText(/Jueves, 22 de octubre/));
    await usuario.click(within(panel).getByLabelText("Revisión prioritaria"));
    await usuario.type(within(panel).getByLabelText("Mensaje para el paciente (opcional)"), "Aprobada.");
    await usuario.click(within(panel).getByRole("button", { name: "Aprobar y asignar cita" }));

    expect(await esperarTexto("Solicitud aprobada y cita asignada.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dr\. Carlos Ramírez/ })).toHaveAttribute("href", "/admin/citas/c9");
    expect(screen.getByText("Sí")).toBeInTheDocument(); // prioritaria
    expect(llamadasA(llamadas, "POST", "/admin/solicitudes/s1/aprobar")[0].cuerpo).toEqual({
      disponibilidad_id: "f4",
      prioritaria: true,
      respuesta: "Aprobada.",
    });
  });

  it("enviar a la EPS y después registrar que no la autorizó", async () => {
    const llamadas = backendFalso({
      "GET /admin/solicitudes/:id": revision({ historial: [], observaciones: [], en_lista_espera: [] }),
      "POST /admin/solicitudes/:id/enviar-eps": revision({}, {
        estado: "pendiente_eps", enviada_eps_en: "2026-10-01T10:00:00-05:00", revisada_en: "2026-10-01T10:00:00-05:00",
      }),
      "POST /admin/solicitudes/:id/negar": revision({}, {
        estado: "negada", respuesta: "La EPS no autorizó.", respuesta_eps_en: "2026-10-02T10:00:00-05:00",
        revisada_en: "2026-10-01T10:00:00-05:00",
      }),
    });
    const usuario = abrir("/admin/solicitudes/s1", { personal: true });
    expect(await esperarTexto("No tiene citas registradas.")).toBeInTheDocument();
    expect(screen.getByText("Sin observaciones del personal.")).toBeInTheDocument();
    expect(screen.getByText("No está en lista de espera")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Enviar a la EPS" }));
    await usuario.click(screen.getByRole("button", { name: "Volver" }));
    await usuario.click(screen.getByRole("button", { name: "Enviar a la EPS" }));
    await usuario.click(within(screen.getByRole("heading", { name: /Enviar a la EPS/ }).closest(".card")).getByRole("button", { name: "Enviar a la EPS" }));
    expect(await esperarTexto("Solicitud enviada a la EPS.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Respuesta de la EPS" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "No aprobar" }));
    const negar = screen.getByRole("heading", { name: "Registrar que la EPS no la autorizó" }).closest(".card");
    expect(within(negar).getByRole("button", { name: "No aprobar" })).toBeDisabled(); // el motivo es obligatorio
    await usuario.type(within(negar).getByLabelText("Motivo (se le envía al paciente)"), "La EPS no autorizó.");
    await usuario.click(within(negar).getByRole("button", { name: "No aprobar" }));
    expect(await esperarTexto("Solicitud no aprobada.")).toBeInTheDocument();
    expect(screen.getByText("La EPS no autorizó.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/solicitudes/s1/negar")[0].cuerpo).toEqual({ respuesta: "La EPS no autorizó." });
  });

  it("sin horarios, error al aprobar y sin permiso para decidir", async () => {
    backendFalso({
      "GET /admin/solicitudes/:id": revision(),
      "GET /disponibilidad/buscar": [],
    });
    let usuario = abrir("/admin/solicitudes/s1", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Aprobar y asignar cita" }));
    expect(await esperarTexto(/No hay horarios libres de Cardiología/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Volver" }));

    backendFalso({
      "GET /admin/solicitudes/:id": revision({}, { fecha_deseada: "2027-01-01" }),
      "GET /disponibilidad/buscar": FRANJAS.slice(0, 1),
      "POST /admin/solicitudes/:id/aprobar": error(409, "Ese horario ya no está disponible."),
    });
    usuario = abrir("/admin/solicitudes/s1", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Aprobar y asignar cita" }));
    // Sin horarios desde esa fecha: ofrece los más próximos.
    const panel = (await screen.findByRole("heading", { name: "Aprobar y asignar la cita" })).closest(".card");
    await within(panel).findByLabelText(/Martes, 20 de octubre/);
    await usuario.click(within(panel).getByRole("button", { name: "Aprobar y asignar cita" }));
    expect(await esperarTexto("Ese horario ya no está disponible.")).toBeInTheDocument();

    backendFalso({
      "GET /admin/auth/me": { ...PERSONAL, permisos: ["ver_citas"] },
      "GET /admin/solicitudes/:id": revision(),
    });
    abrir("/admin/solicitudes/s1", { personal: true });
    expect(await esperarTexto("Dolor persistente.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar y asignar cita" })).not.toBeInTheDocument();
  });

  it("errores al cargar la revisión o los horarios", async () => {
    backendFalso({ "GET /admin/solicitudes/:id": error(404, "No existe esa solicitud.") });
    abrir("/admin/solicitudes/x", { personal: true });
    expect(await esperarTexto("No existe esa solicitud.")).toBeInTheDocument();

    backendFalso({ "GET /admin/solicitudes/:id": revision(), "GET /disponibilidad/buscar": error(500, "Sin horarios") });
    const usuario = abrir("/admin/solicitudes/s1", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Aprobar y asignar cita" }));
    expect(await esperarTexto("Sin horarios")).toBeInTheDocument();
  });
});

// --- Lista de espera del personal (HU-45, HU-53 a HU-61) ---

function solicitudAdmin(cambios = {}) {
  return {
    id: "le-1",
    especialidad: "Cardiología",
    sedes: ["Sede Poblado", "Sede Laureles"],
    jornada: "tarde",
    modalidad: "virtual",
    canal: "sms",
    estado: "en_espera",
    creado_en: "2026-10-01T08:00:00-05:00",
    posicion: 1,
    total_en_lista: 2,
    oferta: null,
    cita: null,
    especialidad_id: "esp-1",
    paciente_id: "p1",
    paciente_nombre: "Mario Ruiz",
    numero_documento: "1010",
    telefono_whatsapp: "3009998877",
    prioridad: "normal",
    cerrada_en: null,
    minutos_espera: 90,
    ...cambios,
  };
}

describe("Lista de espera del personal", () => {
  const LISTA = {
    dia: "2026-10-01",
    esperando_ahora: 2,
    solicitudes: [
      solicitudAdmin(),
      solicitudAdmin({ id: "le-2", paciente_nombre: "Laura Gómez", posicion: 2, minutos_espera: 300, jornada: "manana", modalidad: null,
        estado: "cupo_ofrecido", oferta: { fecha: "2026-10-20", hora: "08:00:00", expira_en: "2026-10-01T12:00:00-05:00" } }),
      solicitudAdmin({ id: "le-3", paciente_nombre: "Pedro Asignado", posicion: null, estado: "asignada", prioridad: "urgente",
        cita: { id: "c5", fecha: "2026-10-22", hora: "09:00:00", estado: "Asistencia confirmada", numero_comprobante: "SY-5" } }),
    ],
  };

  it("muestra la fila, filtra, ordena y cambia la prioridad", async () => {
    const llamadas = backendFalso({
      "GET /admin/lista-espera": LISTA,
      "PATCH /admin/lista-espera/:id/prioridad": ({ cuerpo }) =>
        solicitudAdmin({ prioridad: cuerpo.prioridad, posicion: 1 }),
    });
    const usuario = abrir("/admin/lista-espera", { personal: true });
    expect(await esperarTexto("Puesto 1 de 2")).toBeInTheDocument();
    expect(screen.getAllByText("5 h")).toHaveLength(2); // cifra de mayor espera y su fila
    expect(screen.queryByText("Pedro Asignado")).not.toBeInTheDocument(); // solo los que siguen esperando

    await usuario.selectOptions(screen.getByLabelText("Mostrar"), "todas");
    expect(screen.getByText("Pedro Asignado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver cita" })).toHaveAttribute("href", "/admin/citas/c5");
    expect(screen.getByText("Urgente", { selector: ".badge" })).toBeInTheDocument(); // cerrada: solo se ve

    await usuario.selectOptions(screen.getByLabelText("Ordenar por"), "espera");
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas[0]).toHaveTextContent("Laura Gómez");

    await usuario.selectOptions(screen.getByLabelText("Prioridad de Mario Ruiz"), "alta");
    expect(await esperarTexto("Prioridad de Mario Ruiz: Alta. Ahora es el puesto 1.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "PATCH", "/admin/lista-espera/le-1/prioridad")[0].cuerpo).toEqual({ prioridad: "alta" });

    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2026-09-30" } });
    await waitFor(() =>
      expect(llamadasA(llamadas, "GET", "/admin/lista-espera").at(-1).query).toEqual({ dia: "2026-09-30" })
    );
  });

  it("confirma una cita eligiendo un horario compatible", async () => {
    const llamadas = backendFalso({
      "GET /admin/lista-espera": LISTA,
      "GET /admin/lista-espera/:id/horarios": [
        { id: "h1", fecha: "2026-10-20", hora: "15:00:00", especialista: "Dr. Carlos Ramírez", sede: "Sede Poblado", modalidad: "virtual", ofrecido: true },
        { id: "h2", fecha: "2026-10-21", hora: "16:00:00", especialista: "Dr. Carlos Ramírez", sede: "Sede Laureles", modalidad: "virtual", ofrecido: false },
      ],
      "POST /admin/lista-espera/:id/confirmar": solicitudAdmin({
        estado: "asignada", cita: { id: "c7", fecha: "2026-10-21", hora: "16:00:00", estado: "Pendiente de confirmar asistencia", numero_comprobante: "SY-7" },
      }),
    });
    const usuario = abrir("/admin/lista-espera", { personal: true });
    await usuario.click((await screen.findAllByRole("button", { name: "Confirmar" }))[0]);
    expect(await esperarTexto(/ya se le ofreció/)).toBeInTheDocument();
    await usuario.click(screen.getByLabelText(/Miércoles, 21 de octubre/));
    await usuario.click(screen.getByRole("button", { name: "Confirmar cita" }));
    expect(await esperarTexto(/Cita confirmada para Mario Ruiz: .*Comprobante SY-7\./)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/lista-espera/le-1/confirmar")[0].cuerpo).toEqual({ disponibilidad_id: "h2" });
  });

  it("sacar de la lista o cancelar la cita asignada", async () => {
    const llamadas = backendFalso({
      "GET /admin/lista-espera": LISTA,
      "POST /admin/lista-espera/:id/cancelar": ({ params }) =>
        params.id === "le-3"
          ? solicitudAdmin({ id: "le-3", paciente_nombre: "Pedro Asignado", estado: "asignada" })
          : solicitudAdmin({ estado: "cancelada" }),
    });
    const usuario = abrir("/admin/lista-espera", { personal: true });
    await usuario.click((await screen.findAllByRole("button", { name: "Sacar" }))[0]);
    expect(screen.getByRole("heading", { name: "¿Sacar a Mario Ruiz de la lista de Cardiología?" })).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Motivo (opcional)"), "Ya no la necesita");
    await usuario.click(screen.getByRole("button", { name: "Sí, sacar de la lista" }));
    expect(await esperarTexto("Mario Ruiz salió de la lista de Cardiología.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/lista-espera/le-1/cancelar")[0].cuerpo).toEqual({ motivo: "Ya no la necesita" });

    await usuario.selectOptions(screen.getByLabelText("Mostrar"), "todas");
    await usuario.click(screen.getByRole("button", { name: "Cancelar cita" }));
    expect(screen.getByText(/se cancela y el horario se ofrece a la lista de espera/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Sí, cancelar la cita" }));
    expect(await esperarTexto("Se canceló la cita de Pedro Asignado.")).toBeInTheDocument();
  });

  it("errores, lista vacía, sin horarios y sin permisos de gestión", async () => {
    backendFalso({
      "GET /admin/lista-espera": LISTA,
      "GET /admin/lista-espera/:id/horarios": [],
      "POST /admin/lista-espera/:id/cancelar": error(400, "Esta solicitud ya no está en la lista de espera."),
    });
    let usuario = abrir("/admin/lista-espera", { personal: true });
    await usuario.click((await screen.findAllByRole("button", { name: "Confirmar" }))[0]);
    expect(await esperarTexto(/No hay horarios libres que se ajusten/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Volver" }));
    await usuario.click(screen.getAllByRole("button", { name: "Sacar" })[0]);
    await usuario.click(screen.getByRole("button", { name: "Sí, sacar de la lista" }));
    expect(await esperarTexto("Esta solicitud ya no está en la lista de espera.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Volver" }));

    backendFalso({
      "GET /admin/lista-espera": { dia: "2026-10-01", esperando_ahora: 0, solicitudes: [] },
    });
    usuario = abrir("/admin/lista-espera", { personal: true });
    expect(await esperarTexto("Nadie está esperando cupo en este momento.")).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Mostrar"), "todas");
    expect(screen.getByText("No hubo solicitudes en la lista este día.")).toBeInTheDocument();

    backendFalso({
      "GET /admin/auth/me": { ...PERSONAL, permisos: ["ver_citas"] },
      "GET /admin/lista-espera": LISTA,
      "GET /admin/lista-espera/:id/horarios": error(500, "x"),
    });
    abrir("/admin/lista-espera", { personal: true });
    expect(await esperarTexto("Mario Ruiz")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Normal").length).toBeGreaterThan(0); // la prioridad se ve, no se edita

    backendFalso({ "GET /admin/lista-espera": error(500, "No cargó la lista.") });
    abrir("/admin/lista-espera", { personal: true });
    expect(await esperarTexto("No cargó la lista.")).toBeInTheDocument();
  });

  it("si no cargan los horarios lo dice, y la lista se refresca sola cada minuto", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const llamadas = backendFalso({
      "GET /admin/lista-espera": LISTA,
      "GET /admin/lista-espera/:id/horarios": error(500, "Sin horarios compatibles."),
    });
    const usuario = abrir("/admin/lista-espera", { personal: true });
    await usuario.click((await screen.findAllByRole("button", { name: "Confirmar" }))[0]);
    expect(await esperarTexto("Sin horarios compatibles.")).toBeInTheDocument();

    const antes = llamadasA(llamadas, "GET", "/admin/lista-espera").length;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(llamadasA(llamadas, "GET", "/admin/lista-espera").length).toBe(antes + 1);
  });
});

// --- Centro de recordatorios (HU-62 a HU-67) ---

const PACIENTES = [
  {
    paciente_id: "p1",
    nombre: "Mario Ruiz",
    numero_documento: "1010",
    telefono_whatsapp: "3009998877",
    canal_preferido: "whatsapp",
    ultimo_envio_en: "2026-10-01T08:00:00-05:00",
    ultimo_envio: "Envió el recordatorio automático por WhatsApp",
    estado: "respondido",
    proximo_programado_en: "2026-10-02T09:00:00-05:00",
    citas_activas: [{ id: "c1", fecha: "2026-10-20", hora: "08:00:00", especialidad: "Cardiología", numero_comprobante: "SY-1" }],
  },
  {
    paciente_id: "p2",
    nombre: "Laura Gómez",
    numero_documento: "2020",
    telefono_whatsapp: "3001112233",
    canal_preferido: "llamada",
    ultimo_envio_en: null,
    ultimo_envio: null,
    estado: null,
    proximo_programado_en: null,
    citas_activas: [],
  },
];

const PLANTILLAS = [
  { clave: "recordatorio_estandar", nombre: "Recordatorio estándar", texto: "Recordatorio SaludYA: tiene cita..." },
  { clave: "confirmacion_urgente", nombre: "Confirmación urgente", texto: null },
  { clave: "cupo_liberado", nombre: "Cupo liberado", texto: "Se liberaron cupos." },
];

function programado(cambios = {}) {
  return {
    id: "r1",
    paciente_id: "p1",
    paciente_nombre: "Mario Ruiz",
    cita_id: "c1",
    canal: "sms",
    plantilla: null,
    texto: "Recuerde su cita.",
    programado_para: "2026-10-02T09:00:00-05:00",
    estado: "pendiente",
    intentos: 1,
    enviado_en: null,
    programado_por: "Ana Admin",
    ...cambios,
  };
}

describe("Centro de recordatorios", () => {
  it("lista pacientes con su último envío y filtra por canal", async () => {
    backendFalso({ "GET /admin/recordatorios": PACIENTES, "GET /admin/recordatorios/programados": [] });
    const usuario = abrir("/admin/recordatorios", { personal: true });
    expect(await esperarTexto("Respondido")).toBeInTheDocument();
    expect(screen.getByText("Sin envíos")).toBeInTheDocument();
    expect(screen.getByText("Todavía no se ha programado ningún mensaje ni llamada.")).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText("Canal"), "llamada");
    expect(screen.queryByText("Mario Ruiz")).not.toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Canal"), "sms");
    expect(screen.getByText("No hay pacientes con ese canal.")).toBeInTheDocument();
  });

  it("programa un mensaje con plantilla y una llamada", async () => {
    const llamadas = backendFalso({
      "GET /admin/recordatorios": PACIENTES,
      "GET /admin/recordatorios/programados": [],
      "GET /admin/recordatorios/plantillas": PLANTILLAS,
      "POST /admin/recordatorios/programados": programado(),
    });
    const usuario = abrir("/admin/recordatorios", { personal: true });
    await usuario.click((await screen.findAllByRole("button", { name: "Programar" }))[0]);

    const formulario = screen.getByRole("heading", { name: "Programar recordatorio para Mario Ruiz" }).closest("form");
    expect(within(formulario).getByRole("option", { name: "Confirmación urgente (elija una cita)" })).toBeDisabled();
    await usuario.selectOptions(within(formulario).getByLabelText("Plantilla"), "recordatorio_estandar");
    expect(within(formulario).getByLabelText("Mensaje")).toHaveValue("Recordatorio SaludYA: tiene cita...");
    await usuario.selectOptions(within(formulario).getByLabelText("Canal"), "correo");
    await usuario.type(within(formulario).getByLabelText("Fecha y hora del envío"), "2026-10-02T09:00");
    await usuario.click(within(formulario).getByRole("button", { name: "Programar" }));

    expect(await esperarTexto(/Se programó el mensaje por Correo electrónico a Mario Ruiz/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/recordatorios/programados")[0].cuerpo).toEqual({
      paciente_id: "p1",
      cita_id: "c1",
      canal: "correo",
      plantilla: "recordatorio_estandar",
      texto: "Recordatorio SaludYA: tiene cita...",
      programado_para: "2026-10-02T09:00",
    });

    // Llamada para un paciente sin citas activas.
    await usuario.click(screen.getAllByRole("button", { name: "Programar" })[1]);
    const llamada = screen.getByRole("heading", { name: "Programar recordatorio para Laura Gómez" }).closest("form");
    expect(within(llamada).getByLabelText("Tipo")).toHaveValue("llamada"); // su canal preferido
    expect(within(llamada).getByText(/Se llamará al 3001112233/)).toBeInTheDocument();
    await usuario.selectOptions(within(llamada).getByLabelText("Cita"), "");
    await usuario.type(within(llamada).getByLabelText("Mensaje de voz de la llamada"), "Hola Laura");
    await usuario.type(within(llamada).getByLabelText("Fecha y hora del envío"), "2026-10-03T10:00");
    await usuario.click(within(llamada).getByRole("button", { name: "Programar" }));
    expect(await esperarTexto(/Se programó la llamada a Laura Gómez/)).toBeInTheDocument();
  });

  it("editar, cancelar y reintentar los programados", async () => {
    const llamadas = backendFalso({
      "GET /admin/recordatorios": PACIENTES,
      "GET /admin/recordatorios/programados": [
        programado(),
        programado({ id: "r2", estado: "fallido", intentos: 3, canal: "llamada" }),
        programado({ id: "r3", estado: "enviado", intentos: 0 }),
      ],
      "GET /admin/recordatorios/plantillas": PLANTILLAS,
      "PUT /admin/recordatorios/programados/:id": programado(),
      "POST /admin/recordatorios/programados/:id/cancelar": programado({ estado: "cancelado" }),
      "POST /admin/recordatorios/programados/:id/reintentar": programado({ id: "r2", estado: "pendiente" }),
    });
    const usuario = abrir("/admin/recordatorios", { personal: true });
    expect(await esperarTexto("Reintentando (1 fallidos)")).toBeInTheDocument();
    expect(screen.getByText("3 intentos")).toBeInTheDocument();

    await usuario.click(screen.getAllByRole("button", { name: "Editar" })[0]);
    const formulario = screen.getByRole("heading", { name: "Editar recordatorio para Mario Ruiz" }).closest("form");
    expect(within(formulario).getByLabelText("Mensaje")).toHaveValue("Recuerde su cita.");
    await usuario.clear(within(formulario).getByLabelText("Mensaje"));
    await usuario.type(within(formulario).getByLabelText("Mensaje"), "Texto nuevo");
    await usuario.click(within(formulario).getByRole("button", { name: "Guardar cambios" }));
    expect(await esperarTexto(/Se reprogramó el mensaje por Mensaje de texto a Mario Ruiz/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "PUT", "/admin/recordatorios/programados/r1")[0].cuerpo).toMatchObject({
      canal: "sms",
      texto: "Texto nuevo",
    });

    await usuario.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);
    await usuario.click(screen.getByRole("button", { name: "No" }));
    await usuario.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);
    await usuario.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    expect(await esperarTexto("Se canceló el recordatorio.")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await esperarTexto(/No salió otra vez/)).toBeInTheDocument();
  });

  it("errores al programar, al reintentar y al cargar", async () => {
    backendFalso({
      "GET /admin/recordatorios": PACIENTES,
      "GET /admin/recordatorios/programados": [programado({ estado: "fallido" })],
      "GET /admin/recordatorios/plantillas": error(400, "No existe ese paciente."),
      "POST /admin/recordatorios/programados": error(400, "La fecha y hora del envío deben ser futuras."),
      "POST /admin/recordatorios/programados/:id/reintentar": programado({ estado: "enviado" }),
    });
    const usuario = abrir("/admin/recordatorios", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await esperarTexto("El recordatorio se envió.")).toBeInTheDocument();

    await usuario.click(screen.getAllByRole("button", { name: "Programar" })[0]);
    expect(await esperarTexto("No existe ese paciente.")).toBeInTheDocument();
    const formulario = screen.getByRole("heading", { name: /Programar recordatorio/ }).closest("form");
    await usuario.type(within(formulario).getByLabelText("Mensaje"), "Hola");
    await usuario.type(within(formulario).getByLabelText("Fecha y hora del envío"), "2026-10-02T09:00");
    await usuario.click(within(formulario).getByRole("button", { name: "Programar" }));
    expect(await esperarTexto("La fecha y hora del envío deben ser futuras.")).toBeInTheDocument();
    await usuario.click(within(formulario).getByRole("button", { name: "Volver" }));
    expect(screen.queryByRole("heading", { name: /Programar recordatorio/ })).not.toBeInTheDocument();

    backendFalso({
      "GET /admin/recordatorios": PACIENTES,
      "GET /admin/recordatorios/programados": [programado()],
      "POST /admin/recordatorios/programados/:id/cancelar": error(400, "No se puede cancelar: el recordatorio ya está enviado."),
    });
    const otro = abrir("/admin/recordatorios", { personal: true });
    await otro.click(await screen.findByRole("button", { name: "Cancelar" }));
    await otro.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    expect(await esperarTexto(/ya está enviado/)).toBeInTheDocument();

    backendFalso({ "GET /admin/recordatorios": error(500, "Sin datos de recordatorios") });
    abrir("/admin/recordatorios", { personal: true });
    expect(await esperarTexto("Sin datos de recordatorios")).toBeInTheDocument();
  });
});
