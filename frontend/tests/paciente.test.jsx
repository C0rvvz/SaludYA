import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TOKEN_PACIENTE } from "../src/api/client";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { ESPECIALIDAD, FRANJAS, SEDE, citaPasada, miCita } from "./datos";

const CATALOGO = {
  "GET /especialidades": [ESPECIALIDAD],
  "GET /sedes": [SEDE],
  "GET /disponibilidad/buscar": FRANJAS,
};

const CITA_CREADA = {
  id: "nueva",
  especialista: FRANJAS[0].especialista,
  sede: SEDE,
  modalidad: "presencial",
  fecha: "2026-10-20",
  hora: "08:00:00",
  canal_recordatorio: "sms",
  estado: "confirmada",
  numero_comprobante: "SY-NUEVA",
  mensaje: "Tu cita quedó confirmada y el comprobante fue generado.",
};

describe("Agendar cita", () => {
  it("busca, elige especialista, día y hora, y confirma con comprobante", async () => {
    const llamadas = backendFalso({ ...CATALOGO, "POST /citas": CITA_CREADA });
    const usuario = abrir("/panel", { paciente: true });

    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("Especialidad"), "esp-1");
    await usuario.type(screen.getByLabelText("Ciudad"), "Medellín");
    await usuario.selectOptions(screen.getByLabelText("Sede"), "sede-1");
    await usuario.selectOptions(screen.getByLabelText("Modalidad"), "presencial");
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));
    expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar")[0].query).toEqual({
      especialidad_id: "esp-1",
      ciudad: "Medellín",
      sede_id: "sede-1",
      modalidad: "presencial",
    });

    // Una tarjeta por especialista (HU-12).
    const tarjetas = await screen.findAllByRole("button", { name: "Ver disponibilidad" });
    expect(tarjetas).toHaveLength(2);
    await usuario.click(tarjetas[0]);

    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await usuario.click(screen.getByRole("button", { name: /21/ })); // otro día
    await usuario.click(screen.getByRole("button", { name: /20/ }));
    await usuario.click(screen.getByRole("button", { name: /Sede Poblado · Virtual/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Confirme su cita")).toBeInTheDocument();
    expect(screen.getByText("CC 1020304050")).toBeInTheDocument();
    await usuario.click(screen.getByLabelText("Mensaje de texto"));
    await usuario.click(screen.getByRole("button", { name: "Confirmar cita" }));

    expect(await esperarTexto("¡Su cita quedó agendada exitosamente!")).toBeInTheDocument();
    expect(screen.getByText("SY-NUEVA")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas")[0].cuerpo).toEqual({
      disponibilidad_id: "f2",
      canal_recordatorio: "sms",
    });

    await usuario.click(screen.getByRole("button", { name: "Agendar otra cita" }));
    expect(await esperarTexto("Busque su especialista")).toBeInTheDocument();
  });

  it("si otro paciente tomó el horario, lo dice y permite volver a buscar", async () => {
    backendFalso({ ...CATALOGO, "POST /citas": error(409, "Ese horario ya no está disponible.") });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Buscar" }));
    await usuario.click((await screen.findAllByRole("button", { name: "Ver disponibilidad" }))[0]);
    await usuario.click(screen.getByRole("button", { name: /8:00/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    await usuario.click(screen.getByRole("button", { name: "← Volver a horarios" }));
    await usuario.click(screen.getByRole("button", { name: /8:00/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    await usuario.click(screen.getByRole("button", { name: "Confirmar cita" }));

    expect(await esperarTexto(/otra persona lo reservó/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Volver a buscar" }));
    expect(await esperarTexto("Busque su especialista")).toBeInTheDocument();
  });

  it("otros errores al confirmar, búsqueda vacía y limpiar filtros", async () => {
    const llamadas = backendFalso({ ...CATALOGO, "POST /citas": error(500, "Error del servidor.") });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Buscar" }));
    await usuario.click((await screen.findAllByRole("button", { name: "Ver disponibilidad" }))[1]);
    await usuario.click(screen.getByRole("button", { name: /9:00/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    await usuario.click(screen.getByRole("button", { name: "Confirmar cita" }));
    expect(await esperarTexto("Error del servidor.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "← Volver a horarios" }));
    await usuario.click(screen.getByRole("button", { name: "← Volver a la búsqueda" }));

    backendFalso({ ...CATALOGO, "GET /disponibilidad/buscar": [] });
    await usuario.type(await screen.findByLabelText("Fecha"), "2026-12-24");
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await esperarTexto(/No se encontraron horarios/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Únase a la lista de espera" })).toHaveAttribute("href", "/lista-espera");

    await usuario.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(screen.getByLabelText("Fecha")).toHaveValue("");
    expect(llamadas.length).toBeGreaterThan(0);
  });

  it("'Agendar de nuevo' llega con la especialidad y busca de una vez", async () => {
    const llamadas = backendFalso(CATALOGO);
    abrir("/panel?especialidad=esp-1", { paciente: true });
    expect((await screen.findAllByRole("button", { name: "Ver disponibilidad" })).length).toBe(2);
    expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar")[0].query).toEqual({ especialidad_id: "esp-1" });
    expect(screen.getByRole("link", { name: "Únase a la lista de espera" })).toHaveAttribute(
      "href",
      "/lista-espera?especialidad=esp-1"
    );
  });

  it("errores al cargar filtros o al buscar", async () => {
    backendFalso({
      "GET /especialidades": error(500, "Sin catálogo"),
      "GET /sedes": error(500, "Sin catálogo"),
      "GET /disponibilidad/buscar": error(500, "Sin horarios"),
    });
    const usuario = abrir("/panel?especialidad=esp-1", { paciente: true });
    expect(await esperarTexto(/No pudimos cargar por completo los filtros/)).toBeInTheDocument();
    expect(await esperarTexto("Sin horarios")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await esperarTexto("Sin horarios")).toBeInTheDocument();
  });

  it("cerrar sesión", async () => {
    backendFalso(CATALOGO);
    const usuario = abrir("/panel", { paciente: true });
    expect(await esperarTexto("Hola, Laura")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await esperarTexto("Ingrese su número de documento")).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_PACIENTE)).toBeNull();
  });
});

describe("Mis citas", () => {
  const PENDIENTE = miCita();
  const CONFIRMADA = miCita({
    id: "cita-2",
    numero_comprobante: "SY-0002",
    fecha: "2026-10-25",
    estado_visible: "asistencia_confirmada",
    estado_texto: "Asistencia confirmada",
    puede_confirmar_asistencia: false,
  });
  const HISTORIAL = [
    citaPasada("h1", "atendida", "Atendida", "2026-09-10", { puede_calificar: true }),
    citaPasada("h2", "no_asistio", "No asistió", "2026-09-05"),
    citaPasada("h3", "cancelada", "Cancelada", "2026-08-20", { motivo_cancelacion: "Viaje" }),
  ];

  it("organiza por estado y confirma la asistencia desde la lista", async () => {
    let citas = [PENDIENTE, CONFIRMADA, ...HISTORIAL];
    const llamadas = backendFalso({
      "GET /citas": () => citas,
      "POST /citas/:id/confirmar-asistencia": () => {
        citas = [{ ...PENDIENTE, estado_visible: "asistencia_confirmada", puede_confirmar_asistencia: false }, CONFIRMADA, ...HISTORIAL];
        return citas[0];
      },
    });
    const usuario = abrir("/mis-citas", { paciente: true });

    // HU-29: con citas por confirmar, esa pestaña se muestra primero.
    expect(await screen.findByRole("tab", { name: "Por confirmar 1" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Próximas 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Historial 3" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Confirmar asistencia" }));
    expect(await esperarTexto(/Confirmó su asistencia a Cardiología/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/confirmar-asistencia")).toHaveLength(1);
    expect(await esperarTexto("No tiene citas pendientes de confirmar.")).toBeInTheDocument();
  });

  it("historial por mes, con filtros por resultado", async () => {
    backendFalso({ "GET /citas": [CONFIRMADA, ...HISTORIAL] });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("tab", { name: /Historial/ }));
    expect(screen.getByRole("region", { name: "Septiembre de 2026" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agosto de 2026" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Canceladas (1)" }));
    expect(screen.queryByRole("region", { name: "Septiembre de 2026" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Agendar de nuevo/ })[0]).toHaveAttribute(
      "href",
      "/panel?especialidad=esp-1"
    );
  });

  it("sin citas o con error al cargar", async () => {
    backendFalso({ "GET /citas": [] });
    abrir("/mis-citas", { paciente: true });
    expect(await esperarTexto("No tiene citas próximas.")).toBeInTheDocument();

    backendFalso({ "GET /citas": error(500, "No cargó") });
    abrir("/mis-citas", { paciente: true });
    expect(await esperarTexto("No cargó")).toBeInTheDocument();
  });

  it("detalle: cancelar con motivo", async () => {
    let cita = PENDIENTE;
    const llamadas = backendFalso({
      "GET /citas": () => [cita],
      "GET /citas/:id": () => cita,
      "POST /citas/:id/cancelar": ({ cuerpo }) => {
        cita = { ...PENDIENTE, estado_visible: "cancelada", estado_texto: "Cancelada", puede_cancelar: false,
          puede_reprogramar: false, puede_confirmar_asistencia: false, motivo_cancelacion: cuerpo.motivo };
        return cita;
      },
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Cancelar la cita de Cardiología/ }));

    expect(await esperarTexto("¿Desea cancelar esta cita?")).toBeInTheDocument();
    await usuario.click(screen.getByLabelText("Otro motivo"));
    await usuario.type(screen.getByLabelText("Cuéntenos el motivo"), "Me mudé");
    await usuario.click(screen.getByRole("button", { name: "Sí, cancelar la cita" }));

    expect(await esperarTexto(/Su cita fue cancelada/)).toBeInTheDocument();
    expect(screen.getByText("Me mudé")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/cancelar")[0].cuerpo).toEqual({ motivo: "Me mudé" });

    await usuario.click(screen.getByRole("button", { name: "← Volver a mis citas" }));
    expect(await screen.findByRole("heading", { name: "Mis citas" })).toBeInTheDocument();
  });

  it("detalle: reprogramar eligiendo un horario nuevo", async () => {
    const NUEVA = miCita({ id: "cita-nueva", numero_comprobante: "SY-0099", fecha: "2026-10-21", hora: "15:00:00", reprogramada_desde: "SY-0001" });
    const llamadas = backendFalso({
      "GET /citas": [PENDIENTE, NUEVA],
      "GET /citas/cita-1": PENDIENTE,
      "GET /citas/cita-nueva": NUEVA,
      "GET /disponibilidad/buscar": FRANJAS.slice(1, 3),
      "POST /citas/:id/reprogramar": NUEVA,
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Reprogramar la cita de Cardiología del Martes, 20/ }));

    expect(await esperarTexto("Elija el nuevo horario")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /21/ }));
    await usuario.click(screen.getByRole("button", { name: /3:00/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("¿Confirma el cambio?")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Elegir otro horario" }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, cambiar la cita" }));

    expect(await esperarTexto(/Este es su nuevo comprobante: SY-0099/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/reprogramar")[0].cuerpo).toEqual({ disponibilidad_id: "f3" });
    // Desde la cita nueva se puede abrir la original por su número.
    await usuario.click(screen.getByRole("button", { name: "SY-0001" }));
    expect(await screen.findByRole("button", { name: "Cancelar cita" })).toBeInTheDocument();
  });

  it("detalle: sin horarios para reprogramar, o error al buscarlos", async () => {
    backendFalso({ "GET /citas": [PENDIENTE], "GET /citas/:id": PENDIENTE, "GET /disponibilidad/buscar": [] });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Ver detalle/ }));
    await usuario.click(await screen.findByRole("button", { name: "Reprogramar" }));
    expect(await esperarTexto(/No hay otros horarios disponibles de Cardiología/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Volver" }));

    backendFalso({ "GET /citas/:id": PENDIENTE, "GET /disponibilidad/buscar": error(500, "Sin búsqueda") });
    await usuario.click(screen.getByRole("button", { name: "Reprogramar" }));
    expect(await esperarTexto("Sin búsqueda")).toBeInTheDocument();
  });

  it("el día de la cita registra la llegada y confirma desde el detalle", async () => {
    const HOY = miCita({ puede_registrar_llegada: true });
    const LLEGO = miCita({ estado_visible: "llegada_registrada", estado_texto: "Llegada registrada",
      puede_registrar_llegada: false, puede_cancelar: false, puede_reprogramar: false, puede_confirmar_asistencia: false,
      llegada_disponible_desde: null });
    backendFalso({
      "GET /citas": [HOY],
      "GET /citas/:id": HOY,
      "POST /citas/:id/registrar-llegada": LLEGO,
      "POST /citas/:id/confirmar-asistencia": error(409, "Ya pasó."),
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Ver detalle/ }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar asistencia" }));
    expect(await esperarTexto("Ya pasó.")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Registrar mi llegada" }));
    expect(await esperarTexto(/Registramos su llegada/)).toBeInTheDocument();
    expect(screen.getByText(/muestre este número/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Actualizar estado" }));
  });

  it("registrar la llegada desde la lista", async () => {
    const HOY = miCita({ puede_registrar_llegada: true });
    const llamadas = backendFalso({ "GET /citas": [HOY], "POST /citas/:id/registrar-llegada": HOY });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Registrar mi llegada" }));
    expect(await esperarTexto(/Registramos su llegada a Cardiología/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/registrar-llegada")).toHaveLength(1);
  });

  it("acciones rápidas que fallan muestran el error", async () => {
    backendFalso({ "GET /citas": [PENDIENTE], "POST /citas/:id/confirmar-asistencia": error(409, "Esta cita ya pasó.") });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Confirmar asistencia" }));
    expect(await esperarTexto("Esta cita ya pasó.")).toBeInTheDocument();
  });

  it("calificar la atención de una cita atendida (HU-71)", async () => {
    const ATENDIDA = HISTORIAL[0];
    const CALIFICADA = { ...ATENDIDA, puede_calificar: false, calificacion: 4, comentario_calificacion: "Muy amable" };
    const llamadas = backendFalso({
      "GET /citas": [ATENDIDA],
      "GET /citas/:id": ATENDIDA,
      "POST /citas/:id/calificar": CALIFICADA,
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("tab", { name: /Historial/ }));
    await usuario.click(screen.getByRole("button", { name: /^Calificar la atención/ }));

    const enviar = await screen.findByRole("button", { name: "Enviar calificación" });
    expect(enviar).toBeDisabled();
    await usuario.hover(screen.getByText("3 de 5: Regular").closest("label"));
    expect(screen.getByText("Regular", { selector: ".estrellas__texto" })).toBeInTheDocument();
    await usuario.click(screen.getByLabelText(/4 de 5: Buena/));
    await usuario.type(screen.getByLabelText("Comentario (opcional)"), "  Muy amable  ");
    await usuario.click(enviar);

    expect(await esperarTexto("Gracias por calificar su atención.")).toBeInTheDocument();
    expect(screen.getByText(/4 de 5 · Buena/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/h1/calificar")[0].cuerpo).toEqual({ calificacion: 4, comentario: "Muy amable" });
  });

  it("si el detalle no carga, lo dice", async () => {
    backendFalso({ "GET /citas": [PENDIENTE], "GET /citas/:id": error(404, "No encontramos esa cita.") });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Ver detalle/ }));
    expect(await esperarTexto("No encontramos esa cita.")).toBeInTheDocument();
  });
});

describe("Asistente conversacional (HU-33)", () => {
  const CITA_CHAT = {
    numero_comprobante: "SY-CHAT",
    especialidad: "Cardiología",
    profesional: "Dr. Carlos Ramírez",
    sede: "Sede Poblado",
    ciudad: "Medellín",
    modalidad: "presencial",
    fecha: "2026-10-20",
    hora: "08:00:00",
    recordatorio_por: "whatsapp",
    estado: "Pendiente de confirmar asistencia",
  };

  it("conversa con sugerencias y muestra la cita agendada como tarjeta", async () => {
    const respuestas = [
      { respuesta: "¿Qué especialidad necesita?\n1. Cardiología\n2. Dermatología", tipo: "mensaje", cita: null },
      { respuesta: "Le muestro la cita. ¿Confirma la cita?", tipo: "mensaje", cita: null },
      { respuesta: "Listo, quedó agendada.", tipo: "cita_agendada", cita: CITA_CHAT },
    ];
    const llamadas = backendFalso({
      ...CATALOGO,
      "GET /chat": [{ rol: "paciente", texto: "Hola" }, { rol: "asistente", texto: "Hola, ¿en qué le ayudo?" }],
      "POST /chat": () => respuestas.shift(),
      "DELETE /chat": undefined,
    });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Asistente" }));
    expect(await esperarTexto("Hola, ¿en qué le ayudo?")).toBeInTheDocument(); // recupera la conversación

    await usuario.type(screen.getByLabelText("Escriba su mensaje"), "Quiero una cita");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await usuario.click(await screen.findByRole("button", { name: "1. Cardiología" }));
    await usuario.click(await screen.findByRole("button", { name: "Sí, confirmo" }));

    expect(await esperarTexto("Listo, quedó agendada.")).toBeInTheDocument();
    const tarjeta = screen.getByText("SY-CHAT").closest(".chat-cita");
    expect(within(tarjeta).getByText("Cita confirmada")).toBeInTheDocument();
    expect(within(tarjeta).getByText("WhatsApp")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/chat").map((l) => l.cuerpo.mensaje)).toEqual([
      "Quiero una cita",
      "1. Cardiología",
      "Sí, confirmo",
    ]);

    await usuario.click(screen.getByRole("button", { name: "Nueva conversación" }));
    expect(await esperarTexto(/Soy el asistente de SaludYA/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Cerrar el asistente" }));
    expect(screen.queryByRole("dialog", { name: /Asistente virtual/ })).not.toBeInTheDocument();
  });

  it("una urgencia se muestra destacada con botones para llamar", async () => {
    backendFalso({
      ...CATALOGO,
      "POST /chat": { respuesta: "Llame al 123. También la Línea 192.", tipo: "urgencia", cita: null },
    });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Asistente" }));
    await usuario.click(await screen.findByRole("button", { name: "Solicitar una cita" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Llame al 123");
    expect(screen.getByRole("link", { name: "Llamar al 123" })).toHaveAttribute("href", "tel:123");
    expect(screen.getByRole("link", { name: "Llamar a la Línea 192" })).toBeInTheDocument();
  });

  it("si el asistente falla, devuelve el mensaje al campo para reenviarlo", async () => {
    backendFalso({
      ...CATALOGO,
      "GET /chat": error(500, "sin historial"),
      "POST /chat": error(503, "El asistente no está disponible."),
      "DELETE /chat": error(500, "No se pudo reiniciar."),
    });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Asistente" }));
    await usuario.type(await screen.findByLabelText("Escriba su mensaje"), "Hola{Enter}");
    expect(await esperarTexto("El asistente no está disponible.")).toBeInTheDocument();
    expect(screen.getByLabelText("Escriba su mensaje")).toHaveValue("Hola");

    await usuario.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Asistente" })).toBeInTheDocument();
  });

  it("al reiniciar con error lo avisa, y una sesión vencida cierra la sesión", async () => {
    backendFalso({
      ...CATALOGO,
      "GET /chat": [{ rol: "asistente", texto: "Hola" }],
      "DELETE /chat": error(500, "No se pudo reiniciar."),
      "POST /chat": error(401, "La sesión expiró."),
    });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Asistente" }));
    await usuario.click(await screen.findByRole("button", { name: "Nueva conversación" }));
    expect(await esperarTexto("No se pudo reiniciar.")).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Escriba su mensaje"), "Hola{Enter}");
    await waitFor(() => expect(localStorage.getItem(TOKEN_PACIENTE)).toBeNull());
  });

  it("en Mis citas, una acción del asistente actualiza la lista", async () => {
    const llamadas = backendFalso({
      "GET /citas": [miCita()],
      "POST /chat": { respuesta: "Confirmada.", tipo: "asistencia_confirmada", cita: CITA_CHAT },
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Asistente" }));
    await usuario.type(await screen.findByLabelText("Escriba su mensaje"), "Sí voy{Enter}");
    expect(await esperarTexto("Asistencia confirmada", { selector: ".badge" })).toBeInTheDocument();
    await waitFor(() => expect(llamadasA(llamadas, "GET", "/citas").length).toBe(2));
  });
});
