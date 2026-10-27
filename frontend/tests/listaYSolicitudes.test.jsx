import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { ESPECIALIDAD, ESPECIALISTA, OTRA_SEDE, SEDE } from "./datos";

const ESPECIALISTAS = [{ ...ESPECIALISTA, sedes: [SEDE, OTRA_SEDE], modalidades: ["presencial"] }];

function solicitudEspera(cambios = {}) {
  return {
    id: "le-1",
    especialidad: "Cardiología",
    sedes: ["Sede Poblado"],
    jornada: "manana",
    modalidad: null,
    canal: "whatsapp",
    estado: "en_espera",
    creado_en: "2026-10-01T10:00:00-05:00",
    posicion: 2,
    total_en_lista: 5,
    oferta: null,
    cupo_quitado: null,
    busca_desde: hoy(),
    cita: null,
    ...cambios,
  };
}

function hoy(dias = 0) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toLocaleDateString("en-CA");
}

const OFERTA = {
  especialista: "Dr. Carlos Ramírez",
  sede: "Sede Poblado",
  modalidad: "virtual",
  fecha: "2026-10-20",
  hora: "08:00:00",
  expira_en: "2026-10-01T12:00:00-05:00",
};
const CITA = {
  id: "c1",
  numero_comprobante: "SY-LE1",
  especialista: "Dr. Carlos Ramírez",
  sede: "Sede Poblado",
  fecha: "2026-10-20",
  hora: "08:00:00",
  estado: "Pendiente de confirmar asistencia",
};

describe("Avisarme si hay cupo (lista de espera)", () => {
  it("sin avisos, pide uno con sus preferencias", async () => {
    const llamadas = backendFalso({
      "GET /lista-espera": [],
      "GET /especialidades": [ESPECIALIDAD],
      "GET /especialistas": ESPECIALISTAS,
      "POST /lista-espera": solicitudEspera(),
    });
    const usuario = abrir("/lista-espera", { paciente: true });
    expect(await screen.findByRole("heading", { name: "Pedir un aviso" })).toBeInTheDocument();
    const pedir = screen.getByRole("button", { name: "Avisarme cuando haya cupo" });
    expect(pedir).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Recargar mi posición" })).not.toBeInTheDocument();

    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.click(await screen.findByLabelText("Sede Laureles")); // desmarca una de las dos
    expect(screen.queryByText(/Si ya pasó la mañana de hoy/)).not.toBeInTheDocument();
    await usuario.click(screen.getByLabelText("En la mañana"));
    expect(screen.getByText("Si la mañana de hoy ya pasó, buscaremos cupo desde mañana en la mañana.")).toBeInTheDocument();
    await usuario.click(screen.getByLabelText("Virtual"));
    await usuario.click(screen.getByLabelText("Correo electrónico"));
    await usuario.click(pedir);

    expect(await esperarTexto(/Usted es el número 2\. Le avisaremos por Correo electrónico/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/lista-espera")[0].cuerpo).toEqual({
      especialidad_id: "esp-1",
      sede_ids: ["sede-1"],
      jornada: "manana",
      modalidad: "virtual",
      canal: "correo",
    });
  });

  it("muestra el lugar en la fila y permite aceptar el cupo ofrecido", async () => {
    let lista = [solicitudEspera({ estado: "cupo_ofrecido", oferta: OFERTA, posicion: 1 })];
    backendFalso({
      "GET /lista-espera": () => lista,
      "GET /especialidades": [ESPECIALIDAD],
      "POST /lista-espera/:id/aceptar": () => {
        lista = [solicitudEspera({ estado: "asignada", cita: CITA, oferta: null })];
        return lista[0];
      },
    });
    const usuario = abrir("/lista-espera", { paciente: true });
    const aviso = await screen.findByRole("article", { name: "Cardiología" });
    expect(within(aviso).getByText("Usted es el número 1 de 5 en la lista")).toBeInTheDocument();
    expect(within(aviso).getByText("Cupo ofrecido")).toBeInTheDocument();
    expect(within(aviso).getByText("Se liberó un cupo para usted")).toBeInTheDocument();
    expect(within(aviso).getByText(/Dr\. Carlos Ramírez · Sede Poblado · Virtual/)).toBeInTheDocument();
    expect(within(aviso).getByText(/^Lo tenemos reservado hasta/)).toBeInTheDocument();
    // El recuadro del cupo va arriba, antes del nombre de la especialidad.
    const rotulo = within(aviso).getByText("Se liberó un cupo para usted");
    const titulo = within(aviso).getByRole("heading", { name: "Cardiología" });
    expect(rotulo.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pedir aviso para otra especialidad" })).toBeInTheDocument();

    await usuario.click(within(aviso).getByRole("button", { name: "Aceptar esta cita" }));
    expect(await esperarTexto(/Listo. Su cita quedó agendada/)).toBeInTheDocument();
    expect(await screen.findAllByText(/Comprobante SY-LE1\./)).toHaveLength(2); // aviso y tarjeta
  });

  it("'No me sirve, quitarla' quita el cupo y, mientras dure la reserva, 'Me arrepentí' lo devuelve", async () => {
    const ofrecido = solicitudEspera({ estado: "cupo_ofrecido", oferta: OFERTA });
    // Ya pasó la mañana de hoy: busca desde mañana.
    const quitado = solicitudEspera({ cupo_quitado: { ...OFERTA, se_puede_recuperar: true }, busca_desde: hoy(1) });
    let lista = [ofrecido];
    const llamadas = backendFalso({
      "GET /lista-espera": () => lista,
      "GET /especialidades": [ESPECIALIDAD],
      "POST /lista-espera/:id/rechazar": () => ((lista = [quitado]), quitado),
      "POST /lista-espera/:id/recuperar": () => ((lista = [ofrecido]), ofrecido),
    });
    const usuario = abrir("/lista-espera", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "No me sirve, quitarla" }));

    const aviso = await screen.findByRole("article", { name: "Cardiología" });
    expect(await within(aviso).findByText("Listo, quitamos el cupo del martes 20, 8:00 a. m.")).toBeInTheDocument();
    expect(within(aviso).getByText(/^No se lo volveremos a ofrecer. Seguimos buscando otro cupo en la mañana: como ya pasó la mañana de hoy, buscamos desde mañana /)).toBeInTheDocument();
    expect(within(aviso).getByText(/^Puede recuperarlo hasta/)).toBeInTheDocument();
    expect(within(aviso).getByText("Buscando cupo")).toBeInTheDocument();
    expect(within(aviso).queryByText("Se liberó un cupo para usted")).not.toBeInTheDocument();

    await usuario.click(within(aviso).getByRole("button", { name: "Me arrepentí, ver el cupo otra vez" }));
    expect(await esperarTexto(/Le devolvimos el cupo/)).toBeInTheDocument();
    expect(await screen.findByText("Se liberó un cupo para usted")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/lista-espera/le-1/recuperar")).toHaveLength(1);
  });

  it("si el cupo quitado ya es de otra persona, no ofrece recuperarlo", async () => {
    backendFalso({
      "GET /lista-espera": [
        solicitudEspera({ jornada: "tarde", cupo_quitado: { ...OFERTA, se_puede_recuperar: false } }),
      ],
      "GET /especialidades": [ESPECIALIDAD],
    });
    abrir("/lista-espera", { paciente: true });
    expect(await esperarTexto("Ese cupo ya se lo ofrecimos a otra persona.")).toBeInTheDocument();
    expect(screen.getByText("No se lo volveremos a ofrecer. Seguimos buscando otro cupo en la tarde.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Me arrepentí/ })).not.toBeInTheDocument();
  });

  it("'Ya no quiero el aviso' pide confirmación en una ventana", async () => {
    const llamadas = backendFalso({
      "GET /lista-espera": [solicitudEspera({ modalidad: "presencial" })],
      "GET /especialidades": [ESPECIALIDAD],
      "POST /lista-espera/:id/salir": solicitudEspera({ estado: "cancelada" }),
    });
    const usuario = abrir("/lista-espera", { paciente: true });
    await screen.findByRole("article", { name: "Cardiología" });

    await usuario.click(screen.getByRole("button", { name: "Ya no quiero el aviso" }));
    expect(screen.getByRole("dialog", { name: "¿Ya no quiere el aviso?" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "No, seguir en la lista" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Ya no quiero el aviso" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, quitar el aviso" }));
    expect(await esperarTexto("Listo: ya no le avisaremos de cupos de Cardiología.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/lista-espera/le-1/salir")).toHaveLength(1);

    const antes = llamadasA(llamadas, "GET", "/lista-espera").length;
    await usuario.click(screen.getByRole("button", { name: "Recargar mi posición" }));
    await waitFor(() => expect(llamadasA(llamadas, "GET", "/lista-espera").length).toBeGreaterThan(antes));
  });

  it("llega desde 'Agendar' con la especialidad elegida, y muestra los errores", async () => {
    backendFalso({
      "GET /lista-espera": [solicitudEspera()],
      "GET /especialidades": [ESPECIALIDAD],
      "GET /especialistas": error(500, "Sin especialistas"),
      "POST /lista-espera/:id/salir": error(400, "Esta solicitud ya no está en la lista de espera."),
    });
    const usuario = abrir("/lista-espera?especialidad=esp-1", { paciente: true });
    expect(await esperarTexto("Sin especialistas")).toBeInTheDocument();
    await screen.findByRole("option", { name: "Cardiología" });
    expect(screen.getByLabelText("¿Qué especialidad necesita?")).toHaveValue("esp-1");

    // Si quitar el aviso falla, el error se ve dentro de la ventana.
    await usuario.click(screen.getByRole("button", { name: "Ya no quiero el aviso" }));
    const ventana = screen.getByRole("dialog");
    await usuario.click(within(ventana).getByRole("button", { name: "Sí, quitar el aviso" }));
    expect(await within(ventana).findByText("Esta solicitud ya no está en la lista de espera.")).toBeInTheDocument();
  });

  it("errores al cargar y al pedir el aviso", async () => {
    backendFalso({
      "GET /lista-espera": [],
      "GET /especialidades": error(500, "Sin especialidades"),
    });
    abrir("/lista-espera", { paciente: true });
    expect(await esperarTexto("Sin especialidades")).toBeInTheDocument();

    backendFalso({
      "GET /lista-espera": [],
      "GET /especialidades": [ESPECIALIDAD],
      "GET /especialistas": ESPECIALISTAS,
      "POST /lista-espera": error(400, "Usted ya está en la lista de espera de Cardiología."),
    });
    const usuario = abrir("/lista-espera?especialidad=esp-1", { paciente: true });
    await screen.findByLabelText("Sede Poblado");
    await usuario.click(screen.getByRole("button", { name: "Avisarme cuando haya cupo" }));
    expect(await esperarTexto("Usted ya está en la lista de espera de Cardiología.")).toBeInTheDocument();

    backendFalso({ "GET /lista-espera": error(500, "No cargó la lista") });
    abrir("/lista-espera", { paciente: true });
    expect(await esperarTexto("No cargó la lista")).toBeInTheDocument();
  });

  it("si al pedir el aviso ya hay un cupo, lo anuncia", async () => {
    backendFalso({
      "GET /lista-espera": [],
      "GET /especialidades": [ESPECIALIDAD],
      "GET /especialistas": ESPECIALISTAS,
      "POST /lista-espera": solicitudEspera({ estado: "cupo_ofrecido", oferta: OFERTA }),
    });
    const usuario = abrir("/lista-espera?especialidad=esp-1", { paciente: true });
    await screen.findByLabelText("Sede Poblado");
    await usuario.click(screen.getByRole("button", { name: "Avisarme cuando haya cupo" }));
    expect(await esperarTexto(/hay un cupo para usted\. Revíselo en su aviso/)).toBeInTheDocument();
  });
});

describe("Solicitar petición", () => {
  function solicitud(cambios = {}) {
    return {
      id: "s1",
      numero_radicado: "RAD-1A2B",
      tipo: "derecho_peticion",
      especialidad_id: "esp-1",
      especialidad: "Cardiología",
      tipo_cita: "control",
      fecha_deseada: "2026-10-30",
      motivo: "Necesito control.",
      canal: "sms",
      estado: "pendiente",
      radicada_en: "2026-10-01T10:00:00-05:00",
      respuesta: null,
      cita: null,
      novedades: [
        { texto: "La estamos revisando", en: null },
        { texto: "Recibimos su petición", en: "2026-10-01T10:00:00-05:00" },
      ],
      ...cambios,
    };
  }

  it("elige el tipo de petición (con lo que es), la escribe y la ve con su estado", async () => {
    let lista = [];
    const llamadas = backendFalso({
      "GET /solicitudes": () => lista,
      "GET /especialidades": [ESPECIALIDAD],
      "POST /solicitudes": ({ cuerpo }) => {
        lista = [solicitud()];
        return solicitud({ canal: cuerpo.canal });
      },
    });
    const usuario = abrir("/solicitudes", { paciente: true });
    expect(await esperarTexto(/Todavía no ha enviado peticiones/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nueva petición" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recargar estado" })).not.toBeInTheDocument();
    // Empieza en "Pedir una cita en otra fecha", con su explicación y su pregunta.
    expect(screen.getByLabelText("Pedir una cita en otra fecha")).toBeChecked();
    expect(screen.getByLabelText(/Por qué no le sirven los horarios disponibles/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar petición" })).toBeDisabled();

    await usuario.click(screen.getByLabelText("Derecho de petición"));
    expect(screen.getByText(/obligada a responderle por escrito en máximo 15 días hábiles/)).toBeInTheDocument();
    const enviar = screen.getByRole("button", { name: "Enviar petición" });
    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.click(screen.getByLabelText("Control"));
    await usuario.type(screen.getByLabelText("¿Para qué fecha la necesita?"), "2026-10-30");
    await usuario.type(screen.getByLabelText("¿Qué le pide a su EPS y por qué?"), "Necesito control.");
    await usuario.click(screen.getByLabelText("Mensaje de texto"));
    await usuario.click(enviar);

    expect(await esperarTexto(/Recibimos su petición\. Su número de radicado es RAD-1A2B/)).toBeInTheDocument();
    expect(await esperarTexto("Pendiente de revisión")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cardiología · Control" })).toBeInTheDocument();
    expect(screen.getByText(/^Derecho de petición RAD-1A2B · enviada el 1/)).toBeInTheDocument();
    expect(screen.getByText("Novedad: la estamos revisando")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/solicitudes")[0].cuerpo).toEqual({
      tipo: "derecho_peticion",
      especialidad_id: "esp-1",
      tipo_cita: "control",
      fecha_deseada: "2026-10-30",
      motivo: "Necesito control.",
      canal: "sms",
    });
    // El formulario vuelve a empezar.
    expect(screen.getByLabelText("Pedir una cita en otra fecha")).toBeChecked();
    expect(screen.getByLabelText("¿Qué especialidad necesita?")).toHaveValue("");
  });

  it("muestra la cita asignada, el trámite con la EPS y la respuesta", async () => {
    backendFalso({
      "GET /solicitudes": [
        solicitud({ estado: "aprobada", cita: CITA, respuesta: "Aprobada por el coordinador." }),
        solicitud({ id: "s2", estado: "pendiente_eps", tipo: "formal", tipo_cita: "primera_vez" }),
      ],
      "GET /especialidades": [ESPECIALIDAD],
      "POST /solicitudes": error(400, "La fecha que solicita debe ser a partir de mañana."),
    });
    const usuario = abrir("/solicitudes", { paciente: true });
    expect(await esperarTexto(/Comprobante SY-LE1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver mis citas" })).toHaveAttribute("href", "/mis-citas");
    expect(screen.getByText("Aprobada por el coordinador.")).toBeInTheDocument();
    expect(screen.getByText("En trámite con su EPS")).toBeInTheDocument();
    expect(screen.getByText("Novedad: su EPS la está revisando")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cardiología · Primera vez" })).toBeInTheDocument();

    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.type(screen.getByLabelText("¿Para qué fecha la necesita?"), "2026-10-30");
    await usuario.type(screen.getByLabelText(/Por qué no le sirven los horarios/), "Lo necesito ya mismo.");
    await usuario.click(screen.getByRole("button", { name: "Enviar petición" }));
    expect(await esperarTexto("La fecha que solicita debe ser a partir de mañana.")).toBeInTheDocument();
  });

  it("'Ver todo el detalle' muestra lo que escribió y qué ha pasado; 'Recargar estado' la vuelve a consultar", async () => {
    const llamadas = backendFalso({
      "GET /solicitudes": [solicitud()],
      "GET /especialidades": [ESPECIALIDAD],
    });
    const usuario = abrir("/solicitudes", { paciente: true });
    const peticion = await screen.findByRole("article", { name: "Cardiología · Control" });
    expect(screen.getByText(/^Revisado hoy a las/)).toBeInTheDocument();
    const abrirDetalle = within(peticion).getByRole("button", { name: "Ver todo el detalle" });
    expect(abrirDetalle).toHaveAttribute("aria-expanded", "false");
    expect(within(peticion).queryByText("Lo que usted escribió")).not.toBeVisible();

    await usuario.click(abrirDetalle);
    expect(within(peticion).getByText("Lo que usted escribió")).toBeVisible();
    expect(within(peticion).getByText("“Necesito control.”")).toBeInTheDocument();
    expect(within(peticion).getByText("30 de octubre de 2026")).toBeInTheDocument(); // fecha que pidió
    expect(within(peticion).getByText("Mensaje de texto")).toBeInTheDocument(); // le respondemos por
    const pasos = within(within(peticion).getByRole("list", { name: "Qué ha pasado con su petición" })).getAllByRole("listitem");
    expect(pasos.map((p) => p.textContent)).toEqual([
      "La estamos revisandoEn curso",
      expect.stringMatching(/^Recibimos su petición1 (de )?oct · /),
    ]);

    await usuario.click(within(peticion).getByRole("button", { name: "Ocultar detalle" }));
    expect(within(peticion).getByRole("button", { name: "Ver todo el detalle" })).toHaveAttribute("aria-expanded", "false");

    const antes = llamadasA(llamadas, "GET", "/solicitudes").length;
    await usuario.click(screen.getByRole("button", { name: "Recargar estado" }));
    await waitFor(() => expect(llamadasA(llamadas, "GET", "/solicitudes").length).toBeGreaterThan(antes));
  });

  it("llega desde 'Agendar' con la petición y la especialidad elegidas", async () => {
    backendFalso({ "GET /solicitudes": [solicitud()], "GET /especialidades": [ESPECIALIDAD] });
    abrir("/solicitudes?tipo=derecho_peticion&especialidad=esp-1", { paciente: true });
    await screen.findByRole("option", { name: "Cardiología" });
    expect(screen.getByLabelText("Derecho de petición")).toBeChecked();
    expect(screen.getByLabelText("¿Qué especialidad necesita?")).toHaveValue("esp-1");
  });

  it("errores al cargar", async () => {
    backendFalso({ "GET /solicitudes": error(500, "No cargaron"), "GET /especialidades": error(500, "Sin catálogo") });
    abrir("/solicitudes", { paciente: true });
    expect(await esperarTexto("No cargaron")).toBeInTheDocument();
    expect(await esperarTexto("Sin catálogo")).toBeInTheDocument();
  });
});
