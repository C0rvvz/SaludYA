import { screen } from "@testing-library/react";
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

describe("Lista de espera del paciente", () => {
  it("sin solicitudes muestra el formulario para unirse", async () => {
    const llamadas = backendFalso({
      "GET /lista-espera": [],
      "GET /especialidades": [ESPECIALIDAD],
      "GET /especialistas": ESPECIALISTAS,
      "POST /lista-espera": solicitudEspera(),
    });
    const usuario = abrir("/lista-espera", { paciente: true });
    const unirse = await screen.findByRole("button", { name: "Unirme a la lista de espera" });
    expect(unirse).toBeDisabled();

    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.click(await screen.findByLabelText("Sede Laureles")); // desmarca una de las dos
    await usuario.click(screen.getByLabelText("En la mañana"));
    await usuario.click(screen.getByLabelText("Virtual"));
    await usuario.click(screen.getByLabelText("Correo electrónico"));
    await usuario.click(unirse);

    expect(await esperarTexto(/Usted es el número 2\. Le avisaremos por Correo electrónico/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/lista-espera")[0].cuerpo).toEqual({
      especialidad_id: "esp-1",
      sede_ids: ["sede-1"],
      jornada: "manana",
      modalidad: "virtual",
      canal: "correo",
    });
  });

  it("muestra la posición y permite aceptar el cupo ofrecido", async () => {
    let lista = [solicitudEspera({ estado: "cupo_ofrecido", oferta: OFERTA, posicion: 1 })];
    backendFalso({
      "GET /lista-espera": () => lista,
      "POST /lista-espera/:id/aceptar": () => {
        lista = [solicitudEspera({ estado: "asignada", cita: CITA, oferta: null })];
        return lista[0];
      },
    });
    const usuario = abrir("/lista-espera", { paciente: true });
    expect(await esperarTexto("Se liberó un cupo para usted")).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Carlos Ramírez · Sede Poblado · Virtual/)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Aceptar esta cita" }));
    expect(await esperarTexto(/¡Listo! Su cita quedó agendada/)).toBeInTheDocument();
    expect(await screen.findAllByText(/Comprobante SY-LE1\./)).toHaveLength(2); // aviso y tarjeta
  });

  it("rechazar, salir y unirse a otra lista", async () => {
    const llamadas = backendFalso({
      "GET /lista-espera": [solicitudEspera({ estado: "cupo_ofrecido", oferta: OFERTA, modalidad: "presencial" })],
      "POST /lista-espera/:id/rechazar": solicitudEspera(),
      "POST /lista-espera/:id/salir": solicitudEspera({ estado: "cancelada" }),
      "GET /especialidades": [ESPECIALIDAD],
    });
    const usuario = abrir("/lista-espera", { paciente: true });
    await usuario.click(await screen.findByRole("button", { name: "No me sirve" }));
    expect(await esperarTexto(/Conserva su lugar en la lista/)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Salir de la lista" }));
    await usuario.click(screen.getByRole("button", { name: "No" }));
    await usuario.click(screen.getByRole("button", { name: "Salir de la lista" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, salir" }));
    expect(await esperarTexto("Salió de la lista de espera de Cardiología.")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Actualizar mi posición" }));
    await usuario.click(screen.getByRole("button", { name: "Unirme a otra lista" }));
    expect(screen.getByRole("heading", { name: "Unirme a la lista de espera" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Volver" }));
    expect(llamadasA(llamadas, "GET", "/lista-espera").length).toBeGreaterThan(2);
  });

  it("llega desde la búsqueda con la especialidad elegida, y muestra los errores", async () => {
    backendFalso({
      "GET /lista-espera": [solicitudEspera()],
      "GET /especialidades": [ESPECIALIDAD],
      "GET /especialistas": error(500, "Sin especialistas"),
      "POST /lista-espera/:id/salir": error(400, "Esta solicitud ya no está en la lista de espera."),
    });
    const usuario = abrir("/lista-espera?especialidad=esp-1", { paciente: true });
    expect(await esperarTexto("Sin especialistas")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Salir de la lista" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, salir" }));
    expect(await esperarTexto("Esta solicitud ya no está en la lista de espera.")).toBeInTheDocument();
  });

  it("errores al cargar y al unirse", async () => {
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
    await screen.findAllByLabelText("Sede Poblado");
    const botones = await screen.findAllByRole("button", { name: "Unirme a la lista de espera" });
    await usuario.click(botones.at(-1));
    expect(await esperarTexto("Usted ya está en la lista de espera de Cardiología.")).toBeInTheDocument();

    backendFalso({ "GET /lista-espera": error(500, "No cargó la lista") });
    abrir("/lista-espera", { paciente: true });
    expect(await esperarTexto("No cargó la lista")).toBeInTheDocument();
  });

  it("si al unirse ya hay un cupo, lo anuncia", async () => {
    backendFalso({
      "GET /lista-espera": [],
      "GET /especialidades": [ESPECIALIDAD],
      "GET /especialistas": ESPECIALISTAS,
      "POST /lista-espera": solicitudEspera({ estado: "cupo_ofrecido", oferta: OFERTA }),
    });
    const usuario = abrir("/lista-espera?especialidad=esp-1", { paciente: true });
    await screen.findAllByLabelText("Sede Poblado");
    await usuario.click(screen.getByRole("button", { name: "Unirme a la lista de espera" }));
    expect(await esperarTexto(/hay un cupo para usted: revíselo abajo/)).toBeInTheDocument();
  });
});

describe("Solicitudes de cita del paciente", () => {
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

  it("radica una solicitud y la muestra con su estado", async () => {
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
    const radicar = await screen.findByRole("button", { name: "Radicar solicitud" });
    expect(radicar).toBeDisabled();

    await usuario.click(screen.getByLabelText("Derecho de petición"));
    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.click(screen.getByLabelText("Control"));
    await usuario.type(screen.getByLabelText("¿Para qué fecha necesita la cita?"), "2026-10-30");
    await usuario.type(screen.getByLabelText("Cuéntenos por qué la necesita"), "Necesito control.");
    await usuario.click(screen.getByLabelText("Mensaje de texto"));
    await usuario.click(radicar);

    expect(await esperarTexto(/Radicamos su solicitud con el número RAD-1A2B/)).toBeInTheDocument();
    expect(await esperarTexto("Pendiente de revisión")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/solicitudes")[0].cuerpo).toEqual({
      tipo: "derecho_peticion",
      especialidad_id: "esp-1",
      tipo_cita: "control",
      fecha_deseada: "2026-10-30",
      motivo: "Necesito control.",
      canal: "sms",
    });
  });

  it("muestra la cita asignada, el trámite con la EPS y la respuesta", async () => {
    backendFalso({
      "GET /solicitudes": [
        solicitud({ estado: "aprobada", cita: CITA, respuesta: "Aprobada por el coordinador." }),
        solicitud({ id: "s2", estado: "pendiente_eps", tipo: "formal" }),
      ],
      "GET /especialidades": [ESPECIALIDAD],
      "POST /solicitudes": error(400, "La fecha que solicita debe ser a partir de mañana."),
    });
    const usuario = abrir("/solicitudes", { paciente: true });
    expect(await esperarTexto(/Comprobante SY-LE1/)).toBeInTheDocument();
    expect(screen.getByText("Aprobada por el coordinador.")).toBeInTheDocument();
    expect(screen.getByText(/en trámite con su EPS/)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Radicar una solicitud" }));
    await screen.findByRole("option", { name: "Cardiología" });
    await usuario.selectOptions(screen.getByLabelText("¿Qué especialidad necesita?"), "esp-1");
    await usuario.type(screen.getByLabelText("¿Para qué fecha necesita la cita?"), "2026-10-30");
    await usuario.type(screen.getByLabelText("Cuéntenos por qué la necesita"), "Lo necesito ya mismo.");
    await usuario.click(screen.getByRole("button", { name: "Radicar solicitud" }));
    expect(await esperarTexto("La fecha que solicita debe ser a partir de mañana.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByRole("button", { name: "Radicar una solicitud" })).toBeInTheDocument();
  });

  it("errores al cargar", async () => {
    backendFalso({ "GET /solicitudes": error(500, "No cargaron"), "GET /especialidades": error(500, "Sin catálogo") });
    abrir("/solicitudes", { paciente: true });
    expect(await esperarTexto("No cargaron")).toBeInTheDocument();
    backendFalso({ "GET /solicitudes": [], "GET /especialidades": error(500, "Sin catálogo") });
    abrir("/solicitudes", { paciente: true });
    expect(await esperarTexto("Sin catálogo")).toBeInTheDocument();
  });
});
