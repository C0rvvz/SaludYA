import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrir, backendFalso, llamadasA } from "./backendFalso";
import { citaPasada } from "./datos";

// Cita atendida con copago de Sura, sin pagar.
const ATENDIDA = citaPasada("cita-1", "atendida", "Atendida", "2026-10-15", {
  tipo_cobro: "eps",
  valor: 8000,
  pago_pendiente: true,
  pago_referencia: null,
});

const RESUMEN = {
  cita_id: "cita-1",
  especialidad: "Cardiología",
  especialista: "Dr. Carlos Ramírez",
  sede: "Sede Poblado",
  fecha: "2026-10-15",
  concepto: "Copago EPS Sura",
  valor: 8000,
  pendiente: true,
  pago: null,
  bancos: ["Bancolombia", "Davivienda", "Nequi"],
  correo: "laura@correo.co",
};

function pago(cambios = {}) {
  return {
    referencia: "PAG-2026-08812",
    cita_id: "cita-1",
    metodo: "tarjeta",
    estado: "aprobado",
    valor: 8000,
    detalle: "VISA •••• 4242 · 1 cuota",
    motivo: null,
    fecha: "2026-10-27T10:42:00-05:00",
    codigo_llegada: "4827",
    qr_llegada: "data:image/svg+xml;base64,PHN2Zy8+",
    especialidad: "Cardiología",
    especialista: "Dr. Carlos Ramírez",
    fecha_cita: "2026-10-15",
    ...cambios,
  };
}

describe("Pago en línea de una cita atendida", () => {
  it("desde Mis citas: revisar, pagar con tarjeta de prueba y recibir el código de llegada", async () => {
    const llamadas = backendFalso({
      "GET /citas": [ATENDIDA],
      "GET /citas/:id/pago": RESUMEN,
      "POST /pagos/tarjetas/token": { token: "tok_prueba_1", marca: "VISA", ultimos4: "4242" },
      "POST /citas/:id/pagos": pago(),
      "GET /pagos/:referencia": pago(),
      "POST /pagos/:referencia/comprobante": { mensaje: "Le enviamos el comprobante por mensaje de texto." },
    });
    const usuario = abrir("/mis-citas", { paciente: true });

    const aviso = await screen.findByRole("region", { name: "Pago pendiente" });
    expect(within(aviso).getByText("Tiene un pago pendiente: $8.000")).toBeInTheDocument();
    expect(within(aviso).getByText(/Copago de su cita del 15 de octubre con Dr\. Carlos Ramírez/)).toBeInTheDocument();
    await usuario.click(within(aviso).getByRole("link", { name: "Pagar $8.000" }));

    // Paso 1: Revisar
    expect(await screen.findByRole("heading", { name: "Pagar su consulta" })).toBeInTheDocument();
    expect(screen.getByText("Copago EPS Sura")).toBeInTheDocument();
    expect(screen.getByText(/no cobra dinero real/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Elija cómo quiere pagar.")).toBeInTheDocument();
    await usuario.click(screen.getByRole("radio", { name: /Tarjeta/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));

    // Paso 2: tarjeta. Una tarjeta que no es de prueba ni siquiera se envía.
    expect(await screen.findByRole("heading", { name: "Pago con tarjeta" })).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Número de la tarjeta"), "4000000000000002");
    await usuario.selectOptions(screen.getByLabelText("Mes en que vence"), "12");
    await usuario.selectOptions(screen.getByLabelText("Año en que vence"), String(new Date().getFullYear() + 2));
    await usuario.type(screen.getByLabelText("Código de atrás (CVC)"), "123");
    await usuario.type(screen.getByLabelText("Nombre como aparece en la tarjeta"), "Laura Gómez");
    await usuario.click(screen.getByRole("button", { name: "Pagar $8.000" }));
    expect(screen.getByText(/use una de las tarjetas de prueba/)).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/pagos/tarjetas/token")).toHaveLength(0);

    const numero = screen.getByLabelText("Número de la tarjeta");
    await usuario.clear(numero);
    await usuario.type(numero, "4242424242424242");
    expect(numero).toHaveValue("4242 4242 4242 4242");
    await usuario.click(screen.getByRole("button", { name: "Pagar $8.000" }));

    // Listo: comprobante y código de llegada.
    expect(await screen.findByRole("heading", { name: "¡Pago recibido!" })).toBeInTheDocument();
    const [token] = llamadasA(llamadas, "POST", "/pagos/tarjetas/token");
    expect(token.cuerpo).toMatchObject({ numero: "4242 4242 4242 4242", cvc: "123", mes: 12, titular: "Laura Gómez" });
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/pagos")[0].cuerpo).toEqual({
      metodo: "tarjeta",
      token: "tok_prueba_1",
      cuotas: 1,
    });
    expect(screen.getByText("PAG-2026-08812")).toBeInTheDocument();
    expect(screen.getByText("VISA •••• 4242 · 1 cuota")).toBeInTheDocument();
    expect(screen.getByLabelText("Código 4 8 2 7")).toBeInTheDocument();
    expect(screen.getByText("Escanee el QR o digite estos 4 números en la máquina dentro de la EPS.")).toBeInTheDocument();

    expect(screen.getByRole("radio", { name: "WhatsApp" })).toBeChecked();
    await usuario.click(screen.getByRole("radio", { name: "Mensaje de texto" }));
    await usuario.click(screen.getByRole("button", { name: "Enviar comprobante" }));
    expect(await screen.findByText("Le enviamos el comprobante por mensaje de texto.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/pagos/PAG-2026-08812/comprobante")[0].cuerpo).toEqual({ canal: "sms" });
  });

  it("con PSE: elige el banco, autoriza en la página de prueba del banco y vuelve solo", async () => {
    let estado = "pendiente";
    const llamadas = backendFalso({
      "GET /citas/:id/pago": RESUMEN,
      "POST /citas/:id/pagos": pago({ metodo: "pse", estado: "pendiente", detalle: "PSE · Bancolombia", codigo_llegada: null }),
      "GET /pagos/:referencia": () =>
        pago({ metodo: "pse", estado, detalle: "PSE · Bancolombia", codigo_llegada: estado === "aprobado" ? "4827" : null }),
      "POST /pagos/:referencia/banco": ({ cuerpo }) => {
        estado = cuerpo.autoriza ? "aprobado" : "rechazado";
        return pago({ metodo: "pse", estado });
      },
    });
    const usuario = abrir("/pagar/cita-1", { paciente: true });

    await usuario.click(await screen.findByRole("radio", { name: /PSE/ }));
    await usuario.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("heading", { name: "Pago con PSE" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo registrado en PSE")).toHaveValue("laura@correo.co");
    await usuario.click(screen.getByRole("button", { name: "Ir a mi banco" }));
    expect(screen.getByText("Elija su banco.")).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Su banco"), "Bancolombia");
    await usuario.click(screen.getByRole("radio", { name: /Empresa/ }));
    await usuario.click(screen.getByRole("button", { name: "Ir a mi banco" }));

    expect(await screen.findByRole("heading", { name: "Autorizar un pago a SaludYA" })).toBeInTheDocument();
    expect(screen.getByText(/Simulación de PSE/)).toBeInTheDocument();
    expect(screen.getByText("Bancolombia")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/citas/cita-1/pagos")[0].cuerpo).toEqual({
      metodo: "pse",
      banco: "Bancolombia",
      tipo_persona: "empresa",
      correo: "laura@correo.co",
    });
    await usuario.click(screen.getByRole("button", { name: "Autorizar el pago" }));
    expect(await screen.findByRole("heading", { name: "¡Pago recibido!" })).toBeInTheDocument();
    expect(screen.getByText("PSE · Bancolombia")).toBeInTheDocument();
  });

  it("rechazado: no se le cobró nada, y 'Intentar de nuevo' vuelve al mismo medio de pago", async () => {
    backendFalso({
      "GET /pagos/:referencia": pago({
        estado: "rechazado",
        codigo_llegada: null,
        qr_llegada: null,
        motivo: "El banco no aprobó el pago (fondos insuficientes).",
      }),
      "GET /citas/:id/pago": RESUMEN,
    });
    const usuario = abrir("/pagar/resultado/PAG-2026-08812", { paciente: true });

    expect(await screen.findByRole("heading", { name: "No se pudo hacer el pago" })).toBeInTheDocument();
    expect(screen.getByText("no se le cobró nada")).toBeInTheDocument();
    expect(screen.getByText("El banco no aprobó el pago (fondos insuficientes).")).toBeInTheDocument();
    expect(screen.getByText("Pagar con otro banco o con tarjeta.")).toBeInTheDocument();
    expect(screen.queryByText(/Pedirle ayuda/)).not.toBeInTheDocument(); // sin "Pedirle ayuda a Eli o a un familiar"

    await usuario.click(screen.getByRole("link", { name: "Intentar de nuevo" }));
    expect(await screen.findByRole("heading", { name: "Pago con tarjeta" })).toBeInTheDocument();
  });

  it("en el detalle: 'Pagar' si falta y, ya pagada, el enlace al comprobante", async () => {
    const pagada = { ...ATENDIDA, id: "cita-2", numero_comprobante: "SY-2", pago_pendiente: false, pago_referencia: "PAG-2026-08812" };
    backendFalso({ "GET /citas": [pagada] });
    const usuario = abrir("/mis-citas", { paciente: true });
    await usuario.click(await screen.findByRole("tab", { name: /Historial/ }));
    expect(await screen.findByText(/\$8\.000 · Pagado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver comprobante y código de llegada" })).toHaveAttribute(
      "href",
      "/pagar/resultado/PAG-2026-08812"
    );
    expect(screen.queryByRole("region", { name: "Pago pendiente" })).not.toBeInTheDocument();
  });

  it("una cita que todavía no la atienden no tiene nada que pagar", async () => {
    backendFalso({ "GET /citas/:id/pago": { ...RESUMEN, pendiente: false } });
    abrir("/pagar/cita-1", { paciente: true });
    expect(await screen.findByText(/no tiene pagos pendientes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
  });
});
