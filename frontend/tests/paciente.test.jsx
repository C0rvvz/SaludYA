import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  mensaje: "Su cita quedó confirmada y generamos su comprobante.",
};

describe("Agendar cita", () => {
  it("elige especialidad, médico, día y hora, y confirma con comprobante", async () => {
    const llamadas = backendFalso({ ...CATALOGO, "POST /citas": CITA_CREADA });
    const usuario = abrir("/panel", { paciente: true });

    // Paso 1: la especialidad, con cuántos profesionales tienen cupo.
    const cardiologia = await screen.findByRole("button", { name: /Cardiología/ });
    expect(cardiologia).toHaveTextContent("1 profesional");
    expect(screen.getByRole("button", { name: "Elija una especialidad" })).toBeDisabled();
    expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar")[0].query).toEqual({});
    await usuario.click(cardiologia);
    expect(cardiologia).toHaveAttribute("aria-pressed", "true");
    await usuario.click(screen.getByRole("button", { name: "Continuar con Cardiología" }));

    // Paso 2: busca los horarios de esa especialidad (HU-11) y elige al primero con cupo.
    expect(await esperarTexto("Elija médico, día y hora")).toBeInTheDocument();
    expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar")[1].query).toEqual({ especialidad_id: "esp-1" });
    expect(screen.getByRole("button", { name: /Dr. Carlos Ramírez/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Confirmar cita" })).toBeDisabled();

    await usuario.click(screen.getByRole("button", { name: /21 de octubre: 1 horario/ })); // otro día
    await usuario.click(screen.getByRole("button", { name: /20 de octubre: 2 horarios/ }));
    await usuario.click(screen.getByRole("button", { name: /10:00 a\. m\., Sede Poblado, Virtual/ }));
    const resumen = screen.getByText("Su cita").closest("section");
    expect(within(resumen).getByText("Sede Poblado · Medellín")).toBeInTheDocument();
    expect(within(resumen).getByText("Virtual")).toBeInTheDocument();

    await usuario.click(screen.getByLabelText("Mensaje de texto"));
    await usuario.click(screen.getByRole("button", { name: "Confirmar cita" }));

    // Paso 3: el comprobante (HU-17).
    expect(await esperarTexto("Su cita quedó agendada")).toBeInTheDocument();
    expect(screen.getByText(/Le enviamos el comprobante por mensaje de texto/)).toBeInTheDocument();
    expect(screen.getByText("SY-NUEVA")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas")[0].cuerpo).toEqual({
      disponibilidad_id: "f2",
      canal_recordatorio: "sms",
    });
    expect(screen.getByRole("link", { name: "Ver mis citas" })).toHaveAttribute("href", "/mis-citas");

    await usuario.click(screen.getByRole("button", { name: "Agendar otra cita" }));
    expect(await esperarTexto("¿Qué especialista busca?")).toBeInTheDocument();
  });

  it("el buscador encuentra especialidades y médicos por su nombre, sin importar las tildes", async () => {
    backendFalso(CATALOGO);
    const usuario = abrir("/panel", { paciente: true });
    const buscador = await screen.findByLabelText("Buscar una especialidad o un médico");
    await screen.findByRole("button", { name: /Cardiología/ });

    await usuario.type(buscador, "cardio");
    expect(screen.getByRole("button", { name: /Cardiología/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dermatología/ })).not.toBeInTheDocument();

    await usuario.clear(buscador);
    await usuario.type(buscador, "xyz");
    expect(screen.getByText(/No encontramos «xyz»/)).toBeInTheDocument();

    // Un médico: se pasa directo a sus horarios.
    await usuario.clear(buscador);
    await usuario.type(buscador, "ramirez");
    await usuario.click(screen.getByRole("button", { name: /Dr. Carlos Ramírez/ }));
    expect(await esperarTexto("Elija médico, día y hora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dr. Carlos Ramírez/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("los filtros de ciudad, modalidad y sede cambian los médicos y horarios", async () => {
    backendFalso(CATALOGO);
    const usuario = abrir("/panel?especialidad=esp-1", { paciente: true });
    expect(await screen.findByText("2 médicos con cupo")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Medellín" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Sede Laureles" }));
    expect(screen.getByText("1 médico con cupo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3:00 p\. m\., Sede Laureles/ })).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText("Modalidad"), "virtual");
    expect(screen.getByText("Ningún médico tiene cupo con estos filtros.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Quitar los filtros" }));
    expect(screen.getByText("2 médicos con cupo")).toBeInTheDocument();

    // Otro médico: sus propios días y horas.
    await usuario.click(screen.getByRole("button", { name: /Dra. Ana Gómez/ }));
    expect(screen.getByRole("button", { name: /9:00 a\. m\., Sede Poblado, Presencial/ })).toBeInTheDocument();
  });

  it("si otro paciente tomó el horario, lo dice y vuelve a consultar los cupos", async () => {
    const llamadas = backendFalso({ ...CATALOGO, "POST /citas": error(409, "Ese horario ya no está disponible.") });
    const usuario = abrir("/panel?especialidad=esp-1", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^8:00 a\. m\.,/ }));
    await usuario.click(screen.getByRole("button", { name: "Confirmar cita" }));

    expect(await esperarTexto(/otra persona lo reservó/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar cita" })).toBeDisabled();
    await waitFor(() => expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar")).toHaveLength(3));
  });

  it("otros errores al confirmar se muestran tal cual", async () => {
    backendFalso({ ...CATALOGO, "POST /citas": error(500, "Error del servidor.") });
    const usuario = abrir("/panel?especialidad=esp-1", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^10:00 a\. m\.,/ }));
    await usuario.click(screen.getByRole("button", { name: "Confirmar cita" }));
    expect(await esperarTexto("Error del servidor.")).toBeInTheDocument();
  });

  it("'Agendar de nuevo' llega con la especialidad, entra al paso 2 y ofrece las salidas", async () => {
    const llamadas = backendFalso(CATALOGO);
    const usuario = abrir("/panel?especialidad=esp-1", { paciente: true });
    expect(await esperarTexto("Elija médico, día y hora")).toBeInTheDocument();
    expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar").map((l) => l.query)).toContainEqual({
      especialidad_id: "esp-1",
    });
    expect(screen.getByRole("link", { name: "Pida que le avisemos si hay cupo" })).toHaveAttribute(
      "href",
      "/lista-espera?especialidad=esp-1"
    );
    expect(screen.getByRole("link", { name: "solicite una petición" })).toHaveAttribute(
      "href",
      "/solicitudes?tipo=formal&especialidad=esp-1"
    );

    await usuario.click(screen.getByRole("button", { name: "Cambiar especialidad" }));
    expect(await esperarTexto("¿Qué especialista busca?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar con Cardiología" })).toBeEnabled();
  });

  it("sin horarios libres: lo dice y ofrece el aviso de cupo o la petición", async () => {
    backendFalso({ ...CATALOGO, "GET /disponibilidad/buscar": [] });
    const usuario = abrir("/panel", { paciente: true });
    const cardiologia = await screen.findByRole("button", { name: /Cardiología/ });
    expect(cardiologia).toHaveTextContent("Sin cupos por ahora");
    await usuario.click(cardiologia);
    await usuario.click(screen.getByRole("button", { name: "Continuar con Cardiología" }));

    const sinCupos = (await screen.findByRole("heading", { name: "Por ahora no hay horarios libres de Cardiología" })).closest("section");
    expect(within(sinCupos).getByRole("link", { name: "Avisarme cuando haya cupo" })).toHaveAttribute(
      "href",
      "/lista-espera?especialidad=esp-1"
    );
    // El mismo nombre que en el menú, pero con la especialidad ya elegida.
    expect(within(sinCupos).getByRole("link", { name: "Solicitar petición" })).toHaveAttribute(
      "href",
      "/solicitudes?tipo=formal&especialidad=esp-1"
    );
  });

  it("errores al cargar las especialidades o los horarios", async () => {
    const llamadas = backendFalso({
      "GET /especialidades": error(500, "Sin catálogo"),
      "GET /disponibilidad/buscar": error(500, "Sin horarios"),
    });
    const usuario = abrir("/panel", { paciente: true });
    expect(await esperarTexto(/No pudimos cargar la lista de especialidades: Sin catálogo/)).toBeInTheDocument();
    expect(await esperarTexto(/No pudimos consultar los cupos de cada especialidad: Sin horarios/)).toBeInTheDocument();

    abrir("/panel?especialidad=esp-1", { paciente: true });
    expect(await esperarTexto("Sin horarios")).toBeInTheDocument();
    const antes = llamadasA(llamadas, "GET", "/disponibilidad/buscar").length;
    await usuario.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    await waitFor(() => expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar").length).toBeGreaterThan(antes));
  });

  it("sin enlace redundante a Eli arriba; si no encuentra nada, ofrece preguntarle", async () => {
    backendFalso(CATALOGO);
    const usuario = abrir("/panel", { paciente: true });
    await screen.findByRole("heading", { name: "¿Qué especialista busca?" });
    expect(screen.queryByRole("button", { name: "¿No sabe cuál? Pregúntele a Eli" })).not.toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Buscar una especialidad o un médico"), "zzz");
    await usuario.click(screen.getByRole("button", { name: "pregúntele a Eli" }));
    expect(await screen.findByRole("dialog", { name: /Eli, su guía de SaludYA/ })).toBeInTheDocument();
  });

  it("cerrar sesión", async () => {
    backendFalso(CATALOGO);
    const usuario = abrir("/panel", { paciente: true });
    expect(await screen.findByText("Laura Gómez", { selector: ".cabecera-paciente__nombre" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await esperarTexto("Ingrese su número de documento")).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBeNull();
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
  const DE_LA_CITA = "la cita de Cardiología del Martes, 20 de octubre, 8:00 a. m.";
  const detalle = () => screen.getByRole("heading", { level: 2, name: "Cardiología" }).closest("section");

  it("organiza por estado, muestra el detalle al lado y confirma la asistencia desde la lista", async () => {
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
    expect(screen.getByText("Hola, Laura")).toBeInTheDocument();

    // La primera cita de la pestaña se abre al lado, con su estado y su línea de tiempo (HU-18).
    expect(within(detalle()).getByText("SY-0001")).toBeInTheDocument();
    expect(within(detalle()).getByText("Por confirmar")).toBeInTheDocument();
    expect(screen.getByText("Cita agendada")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: `Confirmar mi asistencia a ${DE_LA_CITA}` }));
    expect(await esperarTexto(/Confirmó su asistencia a Cardiología/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/confirmar-asistencia")).toHaveLength(1);
    expect(await esperarTexto("No tiene citas pendientes de confirmar.")).toBeInTheDocument();

    // Otra cita: su detalle reemplaza al anterior.
    await usuario.click(screen.getByRole("tab", { name: /Próximas/ }));
    await usuario.click(screen.getByRole("button", { name: /^Ver detalle: Cardiología, Domingo, 25 de octubre/ }));
    expect(within(detalle()).getByText("SY-0002")).toBeInTheDocument();
  });

  it("historial por mes, con filtros por resultado", async () => {
    backendFalso({ "GET /citas": [CONFIRMADA, ...HISTORIAL] });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("tab", { name: /Historial/ }));
    expect(screen.getByRole("region", { name: "Septiembre de 2026" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agosto de 2026" })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Canceladas (1)" }));
    expect(screen.queryByRole("region", { name: "Septiembre de 2026" })).not.toBeInTheDocument();
    expect(screen.getByText("Viaje")).toBeInTheDocument(); // el motivo, en el detalle
    expect(screen.getAllByRole("link", { name: /Agendar de nuevo/ })[0]).toHaveAttribute(
      "href",
      "/panel?especialidad=esp-1"
    );
  });

  it("sin citas o con error al cargar", async () => {
    backendFalso({ "GET /citas": [] });
    abrir("/mis-citas", { paciente: true });
    expect(await esperarTexto("No tiene citas próximas.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agendar una cita" })).toHaveAttribute("href", "/panel");

    backendFalso({ "GET /citas": error(500, "No cargó") });
    abrir("/mis-citas", { paciente: true });
    expect(await esperarTexto("No cargó")).toBeInTheDocument();
  });

  it("cancelar en una ventana, con motivo; la cita pasa al historial", async () => {
    let cita = PENDIENTE;
    const llamadas = backendFalso({
      "GET /citas": () => [cita],
      "POST /citas/:id/cancelar": ({ cuerpo }) => {
        cita = { ...PENDIENTE, estado_visible: "cancelada", estado_texto: "Cancelada", puede_cancelar: false,
          puede_reprogramar: false, puede_confirmar_asistencia: false, motivo_cancelacion: cuerpo.motivo };
        return cita;
      },
    });
    const usuario = abrir("/mis-citas", { paciente: true });

    // Escape cierra la ventana sin hacer nada.
    await usuario.click(await screen.findByRole("button", { name: `Cancelar ${DE_LA_CITA}` }));
    expect(screen.getByRole("dialog", { name: "¿Desea cancelar esta cita?" })).toBeInTheDocument();
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Cancelar cita" }));
    const ventana = screen.getByRole("dialog", { name: "¿Desea cancelar esta cita?" });
    await usuario.click(within(ventana).getByLabelText("Otro motivo"));
    await usuario.type(within(ventana).getByLabelText("Cuéntenos el motivo"), "Me mudé");
    await usuario.click(within(ventana).getByRole("button", { name: "Sí, cancelar la cita" }));

    expect(await esperarTexto(/Su cita fue cancelada/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/cancelar")[0].cuerpo).toEqual({ motivo: "Me mudé" });
    expect(screen.getByRole("tab", { name: /Historial/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Me mudé")).toBeInTheDocument();
  });

  it("si cancelar falla, el error se ve dentro de la ventana", async () => {
    backendFalso({ "GET /citas": [PENDIENTE], "POST /citas/:id/cancelar": error(409, "Esta cita ya pasó.") });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Cancelar cita" }));
    const ventana = screen.getByRole("dialog");
    await usuario.click(within(ventana).getByRole("button", { name: "Sí, cancelar la cita" }));
    expect(await within(ventana).findByText("Esta cita ya pasó.")).toBeInTheDocument();
    await usuario.click(within(ventana).getByRole("button", { name: "No, volver" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reprogramar: cita actual y nueva lado a lado; luego se ve la cita nueva", async () => {
    const NUEVA = miCita({ id: "cita-nueva", numero_comprobante: "SY-0099", fecha: "2026-10-21", hora: "15:00:00",
      reprogramada_desde: "SY-0001" });
    const ANTERIOR = { ...PENDIENTE, estado_visible: "reprogramada", estado_texto: "Reprogramada", reprogramada_a: "SY-0099",
      puede_cancelar: false, puede_reprogramar: false, puede_confirmar_asistencia: false };
    let citas = [PENDIENTE];
    const llamadas = backendFalso({
      "GET /citas": () => citas,
      "GET /disponibilidad/buscar": FRANJAS.slice(1, 3),
      "POST /citas/:id/reprogramar": () => {
        citas = [ANTERIOR, NUEVA];
        return NUEVA;
      },
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: `Reprogramar ${DE_LA_CITA}` }));

    expect(await screen.findByRole("heading", { name: "Reprogramar su cita" })).toBeInTheDocument();
    expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar")[0].query).toEqual({ especialidad_id: "esp-1", para_eps: "eps-sura" }); // solo médicos de su EPS o aliadas
    const confirmar = screen.getByRole("button", { name: "Confirmar el cambio" });
    expect(confirmar).toBeDisabled();
    expect(screen.getByText("Elija un día y una hora.")).toBeInTheDocument();

    await usuario.click(await screen.findByRole("button", { name: /21 de octubre: 1 horario/ }));
    await usuario.click(screen.getByRole("button", { name: /^3:00 p\. m\.,/ }));
    expect(screen.getByText(/Mié 21 oct · 3:00 p\. m\./)).toBeInTheDocument();
    await usuario.click(confirmar);

    expect(await esperarTexto(/Este es su nuevo comprobante: SY-0099/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/reprogramar")[0].cuerpo).toEqual({ disponibilidad_id: "f3" });
    expect(within(detalle()).getByText("SY-0099")).toBeInTheDocument();

    // Desde la cita nueva se abre la original por su número (en el historial).
    await usuario.click(screen.getByRole("button", { name: "SY-0001" }));
    expect(screen.getByRole("tab", { name: /Historial/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "SY-0099" })).toBeInTheDocument();
  });

  it("reprogramar: primero con su mismo médico, o con cualquier profesional", async () => {
    backendFalso({ "GET /citas": [PENDIENTE], "GET /disponibilidad/buscar": FRANJAS });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Reprogramar" }));

    const conSuMedico = await screen.findByRole("button", { name: "Con Dr. Ramírez" });
    expect(conSuMedico).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /22 de octubre/ })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Cualquier profesional" }));
    await usuario.click(screen.getByRole("button", { name: /22 de octubre: 1 horario/ }));
    expect(screen.getByRole("button", { name: /9:00 a\. m\., Dra\. Ana Gómez/ })).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "No, volver" }));
    expect(await screen.findByRole("heading", { name: "Mis citas" })).toBeInTheDocument();
  });

  it("reprogramar: sin horarios, error al buscarlos o el horario ya se tomó", async () => {
    backendFalso({ "GET /citas": [PENDIENTE], "GET /disponibilidad/buscar": [] });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Reprogramar" }));
    expect(await esperarTexto(/No hay otros horarios disponibles de Cardiología/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Volver a mis citas" }));

    backendFalso({ "GET /citas": [PENDIENTE], "GET /disponibilidad/buscar": error(500, "Sin búsqueda") });
    await usuario.click(await screen.findByRole("button", { name: "Reprogramar" }));
    expect(await esperarTexto("Sin búsqueda")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "No, volver" }));

    const llamadas = backendFalso({
      "GET /citas": [PENDIENTE],
      "GET /disponibilidad/buscar": FRANJAS.slice(1, 3),
      "POST /citas/:id/reprogramar": error(409, "Ese horario ya no está disponible."),
    });
    await usuario.click(await screen.findByRole("button", { name: "Reprogramar" }));
    await usuario.click(await screen.findByRole("button", { name: /^10:00 a\. m\.,/ }));
    await usuario.click(screen.getByRole("button", { name: "Confirmar el cambio" }));
    expect(await esperarTexto("Ese horario ya no está disponible.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar el cambio" })).toBeDisabled();
    await waitFor(() => expect(llamadasA(llamadas, "GET", "/disponibilidad/buscar")).toHaveLength(2));
  });

  it("el día de la cita: 'Ya llegué' desde el detalle y los datos para recepción", async () => {
    const HOY = miCita({ puede_registrar_llegada: true });
    const LLEGO = miCita({ estado_visible: "llegada_registrada", estado_texto: "Llegada registrada",
      puede_registrar_llegada: false, puede_cancelar: false, puede_reprogramar: false, puede_confirmar_asistencia: false,
      llegada_disponible_desde: null });
    let cita = HOY;
    const llamadas = backendFalso({
      "GET /citas": () => [cita],
      "POST /citas/:id/registrar-llegada": () => {
        cita = LLEGO;
        return LLEGO;
      },
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Ya llegué" }));
    expect(await esperarTexto(/Registramos su llegada a Cardiología/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/registrar-llegada")).toHaveLength(1);
    expect(await esperarTexto(/muestre este número/)).toBeInTheDocument();
  });

  it("la próxima cita, destacada para el celular: 'Ya llegué' y 'Cómo llegar'", async () => {
    const HOY = miCita({ puede_registrar_llegada: true });
    const llamadas = backendFalso({ "GET /citas": [HOY, CONFIRMADA], "POST /citas/:id/registrar-llegada": HOY });
    const usuario = abrir("/mis-citas", { paciente: true });
    const proxima = await screen.findByRole("region", { name: /^Próxima/ });
    expect(within(proxima).getByRole("link", { name: "Cómo llegar" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Poblado%2C%20Medell%C3%ADn"
    );
    await usuario.click(within(proxima).getByRole("button", { name: /^Ya llegué/ }));
    expect(await esperarTexto(/Registramos su llegada/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/registrar-llegada")).toHaveLength(1);
  });

  it("en el celular, el detalle se abre y se cierra con 'Volver a mis citas'", async () => {
    backendFalso({ "GET /citas": [PENDIENTE] });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Ver detalle: Cardiología/ }));
    const pagina = document.querySelector(".mis-citas");
    expect(pagina).toHaveAttribute("data-detalle-en-celular", "si");
    await usuario.click(screen.getByRole("button", { name: "Volver a mis citas" }));
    expect(pagina).toHaveAttribute("data-detalle-en-celular", "no");
  });

  it("acciones que fallan muestran el error, y 'Ver si hay novedades' vuelve a consultar", async () => {
    const llamadas = backendFalso({
      "GET /citas": [PENDIENTE],
      "POST /citas/:id/confirmar-asistencia": error(409, "Esta cita ya pasó."),
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "Confirmar asistencia" }));
    expect(await esperarTexto("Esta cita ya pasó.")).toBeInTheDocument();

    const antes = llamadasA(llamadas, "GET", "/citas").length;
    await usuario.click(screen.getByRole("button", { name: "Ver si hay novedades" }));
    await waitFor(() => expect(llamadasA(llamadas, "GET", "/citas")).toHaveLength(antes + 1));
  });

  it("calificar la atención de una cita atendida, en una ventana (HU-71)", async () => {
    const ATENDIDA = HISTORIAL[0];
    const CALIFICADA = { ...ATENDIDA, puede_calificar: false, calificacion: 4, comentario_calificacion: "Muy amable" };
    let cita = ATENDIDA;
    const llamadas = backendFalso({
      "GET /citas": () => [cita],
      "POST /citas/:id/calificar": () => {
        cita = CALIFICADA;
        return CALIFICADA;
      },
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("tab", { name: /Historial/ }));
    await usuario.click(screen.getByRole("button", { name: /^Calificar la atención de Cardiología/ }));

    const ventana = screen.getByRole("dialog", { name: "¿Cómo fue su atención?" });
    expect(within(ventana).getByText("Dr. Carlos Ramírez")).toBeInTheDocument();
    const enviar = within(ventana).getByRole("button", { name: "Enviar calificación" });
    expect(enviar).toBeDisabled();
    await usuario.hover(within(ventana).getByText("3 de 5: Regular").closest("label"));
    expect(within(ventana).getByText("Regular", { selector: ".estrellas-ventana__texto" })).toBeInTheDocument();
    await usuario.click(within(ventana).getByLabelText(/4 de 5: Buena/));
    await usuario.type(within(ventana).getByLabelText("Comentario (opcional)"), "  Muy amable  ");
    await usuario.click(enviar);

    expect(await esperarTexto("Gracias por calificar su atención.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/h1/calificar")[0].cuerpo).toEqual({ calificacion: 4, comentario: "Muy amable" });
    expect(await esperarTexto(/4 de 5 · Buena/)).toBeInTheDocument();
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
    await usuario.click(await screen.findByRole("button", { name: /^Pregúntele a Eli/ }));
    expect(await esperarTexto("Hola, ¿en qué le ayudo?")).toBeInTheDocument(); // recupera la conversación

    await usuario.type(screen.getByLabelText("Escriba su mensaje"), "Quiero una cita");
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    await usuario.click(await screen.findByRole("button", { name: "1. Cardiología" }));
    await usuario.click(await screen.findByRole("button", { name: "Sí, confirmo" }));

    expect(await esperarTexto("Listo, quedó agendada.")).toBeInTheDocument();
    const tarjeta = screen.getByText("SY-CHAT").closest(".eli-cita");
    expect(within(tarjeta).getByText("Cita confirmada")).toBeInTheDocument();
    expect(within(tarjeta).getByText("WhatsApp")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/chat").map((l) => l.cuerpo.mensaje)).toEqual([
      "Quiero una cita",
      "1. Cardiología",
      "Sí, confirmo",
    ]);

    await usuario.click(screen.getByRole("button", { name: "Nueva conversación" }));
    expect(await esperarTexto(/Soy Eli, su guía de SaludYA/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Cerrar a Eli" }));
    expect(screen.queryByRole("dialog", { name: /Eli, su guía de SaludYA/ })).not.toBeInTheDocument();
  });

  it("la cita que Eli propone se ve como tarjeta, con 'Agendar esa cita', 'Elegir otra fecha' y la petición", async () => {
    // Reloj fijo: si la prueba corre el 25 o el 26 de octubre, la tarjeta diría "Mañana" u "Hoy".
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-20T09:00:00"));
    const PROPUESTA = {
      especialidad: "Cardiología",
      especialidad_id: "esp-1",
      profesional: "Dr. Carlos Ramírez",
      sede: "Sede Poblado",
      ciudad: "Medellín",
      modalidad: "presencial",
      fecha: "2026-10-26",
      hora: "14:30:00",
    };
    const respuestas = [
      { respuesta: "Le recomiendo Cardiología. ¿Confirma la cita?", tipo: "mensaje", cita: null, propuesta: PROPUESTA },
      { respuesta: "¿Qué otra fecha le sirve?", tipo: "mensaje", cita: null, propuesta: null },
      { respuesta: "Le propongo esta otra. ¿Confirma la cita?", tipo: "mensaje", cita: null, propuesta: PROPUESTA },
      { respuesta: "Listo, quedó agendada.", tipo: "cita_agendada", cita: CITA_CHAT, propuesta: null },
    ];
    const llamadas = backendFalso({ ...CATALOGO, "POST /chat": () => respuestas.shift() });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Pregúntele a Eli/ }));
    await usuario.type(await screen.findByLabelText("Escriba su mensaje"), "Me duele el pecho al subir escaleras{Enter}");

    expect(await esperarTexto(/Cardiología · Lun 26 oct/)).toBeInTheDocument();
    expect(screen.getByText(/2:30 p. m. · Sede Poblado · Presencial/)).toBeInTheDocument();
    // Con la propuesta, las respuestas rápidas son las del diseño (no "Sí, confirmo").
    expect(screen.queryByRole("button", { name: "Sí, confirmo" })).not.toBeInTheDocument();
    const eli = screen.getByRole("dialog", { name: "Eli, su guía de SaludYA" });
    expect(within(eli).getByRole("link", { name: "Solicitar petición" })).toHaveAttribute(
      "href",
      "/solicitudes?tipo=formal&especialidad=esp-1"
    );

    await usuario.click(screen.getByRole("button", { name: "Elegir otra fecha" }));
    expect(await esperarTexto("¿Qué otra fecha le sirve?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agendar esa cita" })).not.toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Escriba su mensaje"), "El lunes en la tarde{Enter}");
    await usuario.click(await screen.findByRole("button", { name: "Agendar esa cita" }));
    expect(await esperarTexto("Listo, quedó agendada.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/chat").map((l) => l.cuerpo.mensaje)).toEqual([
      "Me duele el pecho al subir escaleras",
      "Quiero elegir otra fecha",
      "El lunes en la tarde",
      "Sí, agende esa cita",
    ]);
  });

  it("'Escriba o hable…': dicta el mensaje con el micrófono, si el navegador lo permite", async () => {
    let ultimo;
    class ReconocimientoFalso {
      start() {
        ultimo = this;
      }
      stop() {
        this.onend();
      }
      abort() {}
    }
    vi.stubGlobal("SpeechRecognition", ReconocimientoFalso);
    backendFalso({ ...CATALOGO, "POST /chat": { respuesta: "Con gusto.", tipo: "mensaje", cita: null } });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Pregúntele a Eli/ }));

    const entrada = await screen.findByLabelText("Escriba su mensaje");
    expect(entrada).toHaveAttribute("placeholder", "Escriba o hable…");
    await usuario.click(screen.getByRole("button", { name: "Hablar: dictar el mensaje" }));
    expect(ultimo.lang).toBe("es-CO");
    expect(entrada).toHaveAttribute("placeholder", "Le escucho… hable ahora");

    act(() => ultimo.onresult({ results: [[{ transcript: "Necesito una cita" }]] }));
    expect(entrada).toHaveValue("Necesito una cita");
    await usuario.click(screen.getByRole("button", { name: "Dejar de escuchar" }));
    await usuario.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await esperarTexto("Con gusto.")).toBeInTheDocument();

    // Si el navegador no deja usar el micrófono, lo explica.
    await usuario.click(screen.getByRole("button", { name: "Hablar: dictar el mensaje" }));
    act(() => {
      ultimo.onerror({ error: "not-allowed" });
      ultimo.onend();
    });
    expect(screen.getByText(/permita el uso del micrófono/)).toBeInTheDocument();
  });

  it("una urgencia se muestra destacada con botones para llamar", async () => {
    backendFalso({
      ...CATALOGO,
      "POST /chat": { respuesta: "Llame al 123. También la Línea 192.", tipo: "urgencia", cita: null },
    });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Pregúntele a Eli/ }));
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
    await usuario.click(await screen.findByRole("button", { name: /^Pregúntele a Eli/ }));
    await usuario.type(await screen.findByLabelText("Escriba su mensaje"), "Hola{Enter}");
    expect(await esperarTexto("El asistente no está disponible.")).toBeInTheDocument();
    expect(screen.getByLabelText("Escriba su mensaje")).toHaveValue("Hola");

    await usuario.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /^Pregúntele a Eli/ })).toBeInTheDocument();
  });

  it("al reiniciar con error lo avisa, y una sesión vencida cierra la sesión", async () => {
    backendFalso({
      ...CATALOGO,
      "GET /chat": [{ rol: "asistente", texto: "Hola" }],
      "DELETE /chat": error(500, "No se pudo reiniciar."),
      "POST /chat": error(401, "La sesión expiró."),
    });
    const usuario = abrir("/panel", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Pregúntele a Eli/ }));
    await usuario.click(await screen.findByRole("button", { name: "Nueva conversación" }));
    expect(await esperarTexto("No se pudo reiniciar.")).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Escriba su mensaje"), "Hola{Enter}");
    await waitFor(() => expect(sessionStorage.getItem(TOKEN_PACIENTE)).toBeNull());
  });

  it("en Mis citas, una acción del asistente actualiza la lista", async () => {
    const llamadas = backendFalso({
      "GET /citas": [miCita()],
      "POST /chat": { respuesta: "Confirmada.", tipo: "asistencia_confirmada", cita: CITA_CHAT },
    });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: /^Pregúntele a Eli/ }));
    await usuario.type(await screen.findByLabelText("Escriba su mensaje"), "Sí voy{Enter}");
    expect(await esperarTexto("Asistencia confirmada", { selector: ".badge" })).toBeInTheDocument();
    await waitFor(() => expect(llamadasA(llamadas, "GET", "/citas").length).toBe(2));
  });
});
