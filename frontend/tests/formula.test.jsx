import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { citaPasada } from "./datos";

const ATENDIDA = citaPasada("p1", "atendida", "Atendida", "2026-10-15", { tiene_formula: true, puede_calificar: true });
const OTRA_ATENDIDA = citaPasada("p2", "atendida", "Atendida", "2026-09-02");

const FARMACIAS = [
  { id: "f1", nombre: "Droguería Vida Sana", barrio: "El Poblado", ciudad: "Medellín", direccion: null, aliada: true,
    distancia_km: 0.8, sede: "Sede Poblado" },
  { id: "f2", nombre: "Farmacia Nueva Salud", barrio: "Manila", ciudad: "Medellín", direccion: null, aliada: false,
    distancia_km: 1.4, sede: "Sede Poblado" },
  { id: "f3", nombre: "Farmacia La Esperanza", barrio: "Laureles", ciudad: "Medellín", direccion: "Cra. 76 # 33-10",
    aliada: true, distancia_km: 0.6, sede: "Sede Laureles" },
];

function formula(cambios = {}) {
  return {
    codigo: "FM-2026-07733",
    vence_en: "2099-11-14",
    cubierta_por_eps: true,
    diagnostico: "Faringitis aguda",
    nota: "Dolor de garganta desde hace dos días.",
    medicamentos: [
      { nombre: "Amoxicilina", dosis: "500 mg", indicacion: "1 cápsula cada 8 horas", duracion: "Durante 7 días",
        cantidad: "21 cápsulas" },
      { nombre: "Acetaminofén", dosis: "500 mg", indicacion: "1 tableta cada 6 horas si tiene fiebre", duracion: "",
        cantidad: "" },
    ],
    recomendaciones: ["Tome mucha agua.", "Descanse."],
    registrada_en: "2026-10-15T10:00:00-05:00",
    registrada_por: "IPS (actualización simulada)",
    especialidad: "Cardiología",
    especialista: "Dr. Carlos Ramírez",
    fecha: "2026-10-15",
    hora: "08:00:00",
    sede: "Sede Poblado",
    qr: "data:image/svg+xml;base64,PHN2Zy8+",
    farmacias: FARMACIAS,
    ...cambios,
  };
}

async function abrirHistorial(rutas) {
  const llamadas = backendFalso({ "GET /citas": [OTRA_ATENDIDA, ATENDIDA], ...rutas });
  const usuario = abrir("/mis-citas", { paciente: true });
  await usuario.click(await screen.findByRole("tab", { name: /Historial/ }));
  return { usuario, llamadas };
}

describe("Fórmula médica en Mis citas", () => {
  it("'Fórmula lista' en el historial, y lo que formuló el médico", async () => {
    const { llamadas } = await abrirHistorial({ "GET /citas/:id/formula": formula() });
    expect(screen.getByText("En el historial encuentra lo que le formuló su médico y dónde reclamarlo.")).toBeInTheDocument();
    const tarjeta = screen.getByRole("button", { name: /15 de octubre.*fórmula lista/ });
    expect(within(tarjeta).getByText("Fórmula lista")).toBeInTheDocument();
    // La otra atendida (sin fórmula) sigue diciendo "Atendida" y no se consulta.
    expect(within(screen.getByRole("button", { name: /2 de septiembre/ })).getByText("Atendida")).toBeInTheDocument();

    const seccion = await screen.findByRole("region", { name: "Su fórmula médica" });
    expect(within(seccion).getByText("Faringitis aguda")).toBeInTheDocument();
    expect(within(seccion).getByText("“Dolor de garganta desde hace dos días.”")).toBeInTheDocument();
    expect(within(seccion).getByText("Cubiertos por su EPS")).toBeInTheDocument();
    expect(within(seccion).getByText("1 cápsula cada 8 horas")).toBeInTheDocument();
    expect(within(seccion).getByText("Durante 7 días · 21 cápsulas")).toBeInTheDocument();
    expect(within(seccion).getByText("Descanse.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "GET", "/citas/p1/formula")).toHaveLength(1);
    expect(llamadasA(llamadas, "GET", "/citas/p2/formula")).toHaveLength(0);
  });

  it("farmacias: el QR en la aliada más cercana, 'Ver mi código' y 'Cómo llegar'", async () => {
    const { usuario } = await abrirHistorial({ "GET /citas/:id/formula": formula() });
    const donde = await screen.findByRole("region", { name: "Dónde reclamar sus medicamentos" });
    expect(within(donde).getByText("En las farmacias aliadas los recibe gratis mostrando su código.")).toBeInTheDocument();
    expect(within(donde).getAllByText("Aliada · gratis")).toHaveLength(2);
    expect(within(donde).getByText("No aliada · con costo")).toBeInTheDocument();
    expect(within(donde).getByText("El Poblado, Medellín · 0,8 km de Sede Poblado")).toBeInTheDocument();
    expect(within(donde).getByText("Cra. 76 # 33-10 · 0,6 km de Sede Laureles")).toBeInTheDocument();

    const qr = within(donde).getByRole("img", { name: "Código QR de su fórmula FM-2026-07733" });
    expect(qr).toHaveAttribute("src", formula().qr);
    expect(within(donde).getByText("Le entregan sus 2 medicamentos sin costo. Vale hasta el 14 de noviembre.")).toBeInTheDocument();
    // Solo un código abierto a la vez; en la no aliada no hay código.
    expect(within(donde).queryByRole("button", { name: "Ver mi código para Droguería Vida Sana" })).not.toBeInTheDocument();
    expect(within(donde).queryByRole("button", { name: "Ver mi código para Farmacia Nueva Salud" })).not.toBeInTheDocument();
    await usuario.click(within(donde).getByRole("button", { name: "Ver mi código para Farmacia La Esperanza" }));
    expect(within(donde).getAllByRole("img", { name: /Código QR/ })).toHaveLength(1);
    expect(within(donde).getByRole("button", { name: "Ver mi código para Droguería Vida Sana" })).toBeInTheDocument();

    expect(within(donde).getByRole("link", { name: "Cómo llegar a Farmacia Nueva Salud" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Manila%2C%20Medell%C3%ADn"
    );
    expect(within(donde).getByRole("link", { name: "Cómo llegar a Farmacia La Esperanza" })).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent("Cra. 76 # 33-10, Medellín"))
    );
  });

  it("'Descargar fórmula' la imprime (o la guarda en PDF) con sus datos", async () => {
    const impresa = [];
    vi.spyOn(window, "print").mockImplementation(() => impresa.push(document.querySelector(".formula-impresa")?.textContent));
    const { usuario } = await abrirHistorial({ "GET /citas/:id/formula": formula() });
    await usuario.click(await screen.findByRole("button", { name: "Descargar fórmula" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(impresa[0]).toContain("Faringitis aguda");
    expect(impresa[0]).toContain("Amoxicilina 500 mg");
    expect(impresa[0]).toContain("FM-2026-07733");
    expect(impresa[0]).toContain("Paciente: Laura Gómez");
    // Al cerrar el diálogo de impresión, se quita.
    expect(document.querySelector(".formula-impresa")).toBeNull();
  });

  it("vencida, sin cobertura de la EPS o sin medicamentos", async () => {
    const { usuario } = await abrirHistorial({
      "GET /citas/:id/formula": formula({ vence_en: "2020-01-14", cubierta_por_eps: false }),
    });
    expect(await esperarTexto(/Esta fórmula venció el 14 de enero/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Código QR/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver mi código/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Cubiertos por su EPS")).not.toBeInTheDocument();
    expect(screen.getByText("Su EPS no cubre estos medicamentos: tienen costo en cualquier farmacia.")).toBeInTheDocument();
    expect(screen.getAllByText("Aliada")).toHaveLength(2);

    backendFalso({
      "GET /citas": [OTRA_ATENDIDA, ATENDIDA],
      "GET /citas/:id/formula": formula({ medicamentos: [], recomendaciones: ["Camine 30 minutos al día."] }),
    });
    await usuario.click(screen.getByRole("button", { name: /Ver detalle: .*2 de septiembre/ }));
    await usuario.click(screen.getByRole("button", { name: /Ver detalle: .*15 de octubre/ }));
    expect(await esperarTexto("Camine 30 minutos al día.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dónde reclamar sus medicamentos" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar fórmula" })).toBeInTheDocument();
  });

  it("si no carga, lo dice", async () => {
    await abrirHistorial({ "GET /citas/:id/formula": error(404, "Esta cita no tiene fórmula médica.") });
    expect(await esperarTexto("Esta cita no tiene fórmula médica.")).toBeInTheDocument();
  });
});

const ACCIONES = {
  confirmar: false,
  reprogramar: false,
  cancelar: false,
  recordatorio: false,
  contactar: true,
  registrar_resultado: true,
  observar: false,
  formula: true,
};

function detalleAtendida(cambios = {}) {
  return {
    id: "ca-1",
    numero_comprobante: "SY-ADM1",
    especialidad_id: "esp-1",
    especialidad: "Cardiología",
    especialista: "Dr. Carlos Ramírez",
    sede: "Sede Poblado",
    ciudad: "Medellín",
    modalidad: "presencial",
    fecha: "2026-10-15",
    hora: "08:00:00",
    estado_visible: "atendida",
    estado_texto: "Atendida",
    canal_recordatorio: "whatsapp",
    recordatorio_enviado_en: null,
    riesgo: null,
    acciones: ACCIONES,
    paciente: {
      id: "pac-1", nombre: "Mario Ruiz", tipo_documento: "cedula_ciudadania", numero_documento: "1010",
      telefono_whatsapp: "3009998877", correo: null, eps: "EPS Sura", estado_afiliacion: "activa",
    },
    motivo_cancelacion: null,
    historial_estado: [],
    historial_asistencia: [],
    resumen_asistencia: { atendidas: 1, no_asistio: 0, canceladas: 0, reprogramadas: 0 },
    recordatorios: [],
    contactos: [],
    observaciones: [],
    auditoria: [],
    formula: null,
    ...cambios,
  };
}

describe("Fórmula médica en el detalle del personal", () => {
  it("registrarla: diagnóstico, medicamentos y recomendaciones", async () => {
    const { qr: _qr, farmacias: _farmacias, ...registrada } = formula();
    const llamadas = backendFalso({
      "GET /admin/citas/:id": detalleAtendida(),
      "PUT /admin/citas/:id/formula": detalleAtendida({ formula: registrada }),
    });
    const usuario = abrir("/admin/citas/ca-1", { personal: true });
    const tarjeta = await screen.findByRole("region", { name: "Fórmula médica" });
    expect(within(tarjeta).getByText(/Todavía no hay fórmula de esta cita/)).toBeInTheDocument();
    await usuario.click(within(tarjeta).getByRole("button", { name: "Registrar fórmula" }));

    await usuario.type(screen.getByLabelText("Diagnóstico"), "Faringitis aguda");
    await usuario.type(screen.getByLabelText("Lo que escribió el médico (opcional)"), "Dolor de garganta.");
    await usuario.type(screen.getByLabelText("Medicamento", { selector: "#medicamento_0_nombre" }), "Amoxicilina");
    await usuario.type(screen.getByLabelText("Dosis", { selector: "#medicamento_0_dosis" }), "500 mg");
    await usuario.type(screen.getByLabelText("Cada cuánto", { selector: "#medicamento_0_indicacion" }), "1 cada 8 horas");
    // Una fila de más, vacía: no se envía.
    await usuario.click(screen.getByRole("button", { name: "Agregar medicamento" }));
    await usuario.click(screen.getByRole("button", { name: "Agregar medicamento" }));
    await usuario.click(screen.getByRole("button", { name: "Quitar el medicamento 3" }));
    expect(screen.queryByText("Medicamento 3")).not.toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Recomendaciones (una por línea)"), "Tome agua.{Enter}{Enter}Descanse.");
    await usuario.click(screen.getByRole("checkbox", { name: /cubiertos por la EPS/ }));
    await usuario.click(screen.getByRole("button", { name: "Guardar fórmula" }));

    expect(await esperarTexto("Fórmula registrada. Le avisamos al paciente por WhatsApp.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "PUT", "/admin/citas/ca-1/formula")[0].cuerpo).toEqual({
      diagnostico: "Faringitis aguda",
      nota: "Dolor de garganta.",
      medicamentos: [{ nombre: "Amoxicilina", dosis: "500 mg", indicacion: "1 cada 8 horas", duracion: "", cantidad: "" }],
      recomendaciones: ["Tome agua.", "Descanse."],
      cubierta_por_eps: false,
    });
    // Ya registrada: se ve lo guardado y se puede corregir.
    expect(within(tarjeta).getByText(/Código FM-2026-07733/)).toBeInTheDocument();
    expect(within(tarjeta).getByText(/Registrada por IPS \(actualización simulada\)/)).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: "Corregir fórmula" })).toBeInTheDocument();
  });

  it("corregirla trae lo que había; un error se muestra; sin permiso no aparece", async () => {
    const { qr: _qr, farmacias: _farmacias, ...registrada } = formula();
    backendFalso({
      "GET /admin/citas/:id": detalleAtendida({ formula: registrada }),
      "PUT /admin/citas/:id/formula": error(400, "Escriba cómo tomar Losartán (p. ej. «1 tableta cada 8 horas»)."),
    });
    const usuario = abrir("/admin/citas/ca-1", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Corregir fórmula" }));
    expect(screen.getByLabelText("Diagnóstico")).toHaveValue("Faringitis aguda");
    expect(screen.getByLabelText("Medicamento", { selector: "#medicamento_1_nombre" })).toHaveValue("Acetaminofén");
    expect(screen.getByLabelText("Recomendaciones (una por línea)")).toHaveValue("Tome mucha agua.\nDescanse.");
    expect(screen.getByRole("checkbox", { name: /cubiertos por la EPS/ })).toBeChecked();
    await usuario.click(screen.getByRole("button", { name: "Guardar fórmula" }));
    expect(await esperarTexto(/Escriba cómo tomar Losartán/)).toBeInTheDocument();
    // Sigue en el formulario para corregir; "No, volver" lo cierra sin guardar.
    await usuario.click(screen.getByRole("button", { name: "No, volver" }));
    expect(screen.getByRole("button", { name: "Corregir fórmula" })).toBeInTheDocument();

    backendFalso({ "GET /admin/citas/:id": detalleAtendida({ acciones: { ...ACCIONES, formula: false } }) });
    abrir("/admin/citas/ca-1", { personal: true });
    expect(await screen.findByRole("heading", { name: "Mario Ruiz" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Fórmula médica" })).not.toBeInTheDocument());
  });
});
