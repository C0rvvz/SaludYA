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
    cita: null,
    ...cambios,
  };
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
    expect(screen.queryByRole("button", { name: "Actualizar mi posición" })).not.toBeInTheDocument();

    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.click(await screen.findByLabelText("Sede Laureles")); // desmarca una de las dos
    await usuario.click(screen.getByLabelText("En la mañana"));
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
    expect(screen.getByRole("heading", { name: "Pedir aviso para otra especialidad" })).toBeInTheDocument();

    await usuario.click(within(aviso).getByRole("button", { name: "Aceptar esta cita" }));
    expect(await esperarTexto(/¡Listo! Su cita quedó agendada/)).toBeInTheDocument();
    expect(await screen.findAllByText(/Comprobante SY-LE1\./)).toHaveLength(2); // aviso y tarjeta
  });

  it("'No me sirve' conserva el lugar; 'Ya no quiero el aviso' pide confirmación en una ventana", async () => {
    const llamadas = backendFalso({
      "GET /lista-espera": [solicitudEspera({ estado: "cupo_ofrecido", oferta: OFERTA, modalidad: "presencial" })],
      "GET /especialidades": [ESPECIALIDAD],
      "POST /lista-espera/:id/rechazar": solicitudEspera(),
      "POST /lista-espera/:id/salir": solicitudEspera({ estado: "cancelada" }),
    });
    const usuario = abrir("/lista-espera", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "No me sirve" }));
    expect(await esperarTexto(/Conserva su lugar en la lista/)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Ya no quiero el aviso" }));
    expect(screen.getByRole("dialog", { name: "¿Ya no quiere el aviso?" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "No, seguir en la lista" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Ya no quiero el aviso" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, quitar el aviso" }));
    expect(await esperarTexto("Listo: ya no le avisaremos de cupos de Cardiología.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/lista-espera/le-1/salir")).toHaveLength(1);

    const antes = llamadasA(llamadas, "GET", "/lista-espera").length;
    await usuario.click(screen.getByRole("button", { name: "Actualizar mi posición" }));
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

describe("Carta de petición", () => {
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
      ...cambios,
    };
  }

  it("elige el tipo de carta (con lo que es), la escribe y la ve con su estado", async () => {
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
    expect(await esperarTexto(/Todavía no ha enviado cartas/)).toBeInTheDocument();
    // Empieza en "Pedir una cita en otra fecha", con su explicación y su pregunta.
    expect(screen.getByLabelText("Pedir una cita en otra fecha")).toBeChecked();
    expect(screen.getByLabelText(/Por qué no le sirven los horarios disponibles/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar mi carta" })).toBeDisabled();

    await usuario.click(screen.getByLabelText("Derecho de petición"));
    expect(screen.getByText(/obligada a responderle por escrito en máximo 15 días hábiles/)).toBeInTheDocument();
    const enviar = screen.getByRole("button", { name: "Enviar mi derecho de petición" });
    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.click(screen.getByLabelText("Control"));
    await usuario.type(screen.getByLabelText("¿Para qué fecha la necesita?"), "2026-10-30");
    await usuario.type(screen.getByLabelText("¿Qué le pide a su EPS y por qué?"), "Necesito control.");
    await usuario.click(screen.getByLabelText("Mensaje de texto"));
    await usuario.click(enviar);

    expect(await esperarTexto(/Recibimos su derecho de petición\. Su número de radicado es RAD-1A2B/)).toBeInTheDocument();
    expect(await esperarTexto("Pendiente de revisión")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cardiología · Control" })).toBeInTheDocument();
    expect(screen.getByText(/Derecho de petición RAD-1A2B · enviada el 1 de oct · para el 30 de oct/)).toBeInTheDocument();
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
    expect(screen.getByText(/en trámite con su EPS/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cardiología · Primera vez" })).toBeInTheDocument();

    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.type(screen.getByLabelText("¿Para qué fecha la necesita?"), "2026-10-30");
    await usuario.type(screen.getByLabelText(/Por qué no le sirven los horarios/), "Lo necesito ya mismo.");
    await usuario.click(screen.getByRole("button", { name: "Enviar mi carta" }));
    expect(await esperarTexto("La fecha que solicita debe ser a partir de mañana.")).toBeInTheDocument();
  });

  it("llega desde 'Agendar' con la carta y la especialidad elegidas", async () => {
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
