import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { ESPECIALIDAD, PERSONAL, SURA, TODOS_LOS_PERMISOS } from "./datos";

// El administrador (PERSONAL) no tiene la historia clínica; Coordinación médica sí.
const COORDINACION = {
  ...PERSONAL,
  id: "per-9",
  nombre: "Camila Ortiz",
  rol: "coordinador_medico",
  rol_texto: "Coordinación médica",
  permisos: ["historia_clinica", "observaciones", "registrar_atencion", "ver_citas", "ver_reportes"],
};
const CALL_CENTER = { ...PERSONAL, rol: "call_center", rol_texto: "Call center", permisos: ["recordatorios", "ver_citas"] };

const FILA = {
  paciente_id: "pac-1",
  cita_id: "ca-1",
  nombre: "Rosa Martínez",
  tipo_documento: "cedula_ciudadania",
  numero_documento: "1038456210",
  eps: "Sura",
  fecha: "2026-10-15",
  especialidad: "Médico general",
  especialista: "Dra. Laura Gómez",
  formula_estado: "parcial",
  formula_estado_texto: "Entrega parcial",
  consultado_en: null,
};

function formula(cambios = {}) {
  return {
    codigo: "FM-2026-07733",
    vence_en: "2099-11-14",
    vigente: true,
    cubierta_por_eps: true,
    diagnostico: "Faringitis aguda",
    cie10: "J02.9",
    nota: "Dolor de garganta y fiebre.",
    medicamentos: [
      { nombre: "Amoxicilina", dosis: "500 mg", indicacion: "Cada 8 horas", duracion: "7 días", cantidad: "21 cápsulas", entregado: true },
      { nombre: "Ibuprofeno", dosis: "400 mg", indicacion: "Cada 12 horas", duracion: "3 días", cantidad: "6 tabletas", entregado: false },
    ],
    recomendaciones: ["Abundantes líquidos."],
    entregados: 1,
    estado_entrega: "parcial",
    estado_entrega_texto: "Entrega parcial",
    farmacia_entrega: "Farmacia Pasteur · aliada",
    ultima_entrega_en: "2026-10-16T11:20:00-05:00",
    registrada_en: "2026-10-15T09:24:00-05:00",
    registrada_por: "Dra. Laura Gómez (Médico)",
    especialidad: "Médico general",
    especialista: "Dra. Laura Gómez",
    fecha: "2026-10-15",
    hora: "09:00:00",
    sede: "Sede Norte",
    ...cambios,
  };
}

function historia(cambios = {}) {
  return {
    paciente: { id: "pac-1", nombre: "Rosa Martínez", tipo_documento: "cedula_ciudadania", numero_documento: "1038456210", eps: "Sura" },
    cita: {
      id: "ca-1", numero_comprobante: "SY-2026-004610", fecha: "2026-10-15", hora: "09:00:00",
      especialidad: "Médico general", especialista: "Dra. Laura Gómez", sede: "Sede Norte", canal: "whatsapp",
    },
    formula: formula(),
    qr: "data:image/svg+xml;base64,PHN2Zy8+",
    consultas: [
      { cita_id: "ca-1", fecha: "2026-10-15", especialidad: "Médico general", especialista: "Dra. Laura Gómez",
        formula_estado: "parcial", formula_estado_texto: "Entrega parcial" },
      { cita_id: "ca-0", fecha: "2026-09-02", especialidad: "Cardiología", especialista: "Dr. Carlos Ramírez",
        formula_estado: "entregada", formula_estado_texto: "Fórmula entregada" },
    ],
    accesos: [
      { quien: "Dra. Laura Gómez (Médico)", que: "Registró la fórmula", fecha: "2026-10-15T09:24:00-05:00", veces: 1 },
      { quien: "Farmacia Pasteur (farmacia)", que: "Entrega con código", fecha: "2026-10-16T11:20:00-05:00", veces: 1 },
      { quien: "Camila Ortiz (Coordinación médica)", que: "Consultó la historia clínica", fecha: "2026-10-27T08:05:00-05:00", veces: 3 },
    ],
    puede_editar: true,
    ...cambios,
  };
}

describe("Historia clínica (acceso restringido)", () => {
  it("Coordinación médica: en el menú con candado, el listado con filtros y páginas", async () => {
    const llamadas = backendFalso({
      "GET /admin/auth/me": COORDINACION,
      "GET /admin/historia-clinica": { total: 21, pagina: 1, por_pagina: 20, pacientes: [FILA] },
      "GET /especialidades": [ESPECIALIDAD],
      "GET /eps": [SURA],
    });
    const usuario = abrir("/admin/historia-clinica", { personal: true });
    expect(await screen.findByRole("heading", { name: "Historia clínica" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Historia clínica, información reservada/ })).toBeInTheDocument();
    expect(screen.getByText(/Cada consulta queda registrada en Auditoría/)).toBeInTheDocument();

    const fila = (await screen.findByRole("link", { name: "Rosa Martínez" })).closest("tr");
    expect(within(fila).getByText("CC 1038456210")).toBeInTheDocument();
    expect(within(fila).getByText("Entrega parcial")).toHaveClass("badge--warning");
    expect(within(fila).getByText("Dra. Laura Gómez")).toBeInTheDocument();
    expect(within(fila).getByRole("link", { name: "Ver la historia clínica de Rosa Martínez" })).toHaveAttribute(
      "href",
      "/admin/historia-clinica/ca-1"
    );
    expect(screen.getByText("Mostrando 1 de 21 pacientes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

    await usuario.type(screen.getByLabelText("Buscar"), "rosa");
    await usuario.selectOptions(screen.getByLabelText("EPS"), "particular");
    await usuario.click(screen.getByRole("button", { name: "Buscar" }));
    await usuario.click(screen.getByRole("button", { name: "Siguiente" }));
    const pedidos = llamadasA(llamadas, "GET", "/admin/historia-clinica").map((l) => l.query);
    expect(pedidos[1]).toEqual({ buscar: "rosa", eps: "particular", periodo: "30", pagina: "1" });
    expect(pedidos[2].pagina).toBe("2");
  });

  it("el detalle: diagnóstico con CIE-10, entrega de cada medicamento, farmacia y quién la ha consultado", async () => {
    const impresa = [];
    vi.spyOn(window, "print").mockImplementation(() => impresa.push(document.querySelector(".formula-impresa")?.textContent));
    const llamadas = backendFalso({
      "GET /admin/auth/me": COORDINACION,
      "GET /admin/historia-clinica/:id": historia(),
      "POST /admin/historia-clinica/:id/reenviar-codigo": { canal: "whatsapp" },
    });
    const usuario = abrir("/admin/historia-clinica/ca-1", { personal: true });
    expect(await screen.findByRole("heading", { name: "Rosa Martínez" })).toBeInTheDocument();
    expect(screen.getByText(/CC 1038456210 · Médico general · Dra. Laura Gómez/)).toBeInTheDocument();
    expect(screen.getByText("J02.9")).toHaveClass("codigo-cie10");
    expect(screen.getByText("“Dolor de garganta y fiebre.”")).toBeInTheDocument();

    const medicamentos = screen.getByRole("region", { name: "Medicamentos formulados" });
    expect(within(medicamentos).getByText("Cubiertos por Sura")).toBeInTheDocument();
    expect(within(within(medicamentos).getByText("Amoxicilina").closest("tr")).getByText("Entregado")).toBeInTheDocument();
    expect(within(within(medicamentos).getByText("Ibuprofeno").closest("tr")).getByText("Pendiente")).toBeInTheDocument();

    const entrega = screen.getByRole("region", { name: "Entrega en farmacia" });
    expect(within(entrega).getByText("FM-2026-07733")).toBeInTheDocument();
    expect(within(entrega).getByText("Farmacia Pasteur · aliada")).toBeInTheDocument();
    expect(within(entrega).getByText("Entrega parcial (1 de 2)")).toBeInTheDocument();

    const accesos = screen.getByRole("region", { name: "Quién ha consultado esta fórmula" });
    expect(within(accesos).getByText("Farmacia Pasteur (farmacia)")).toBeInTheDocument();
    expect(within(accesos).getByText("(3 veces)")).toBeInTheDocument();

    // Las demás consultas del paciente, para pasar de una a otra.
    expect(screen.getByRole("link", { name: /Cardiología · Dr. Carlos Ramírez/ })).toHaveAttribute("href", "/admin/historia-clinica/ca-0");

    await usuario.click(within(entrega).getByRole("button", { name: "Descargar fórmula" }));
    expect(impresa[0]).toContain("Faringitis aguda (CIE-10 J02.9)");
    expect(impresa[0]).toContain("Paciente: Rosa Martínez");

    await usuario.click(within(entrega).getByRole("button", { name: "Reenviar código al paciente" }));
    expect(await esperarTexto("Le reenviamos el código al paciente por WhatsApp.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/historia-clinica/ca-1/reenviar-codigo")).toHaveLength(1);
  });

  it("registrar la fórmula con su código CIE-10 (de los frecuentes, llena el diagnóstico)", async () => {
    const llamadas = backendFalso({
      "GET /admin/auth/me": COORDINACION,
      "GET /admin/historia-clinica/:id": historia({ formula: null, accesos: [] }),
      "PUT /admin/historia-clinica/:id/formula": ({ cuerpo }) =>
        cuerpo.recomendaciones.length ? historia() : error(400, "Agregue al menos un medicamento o una recomendación."),
    });
    const usuario = abrir("/admin/historia-clinica/ca-1", { personal: true });
    expect(await esperarTexto(/Esta consulta todavía no tiene fórmula/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Registrar fórmula" }));

    await usuario.type(screen.getByLabelText("Código CIE-10"), "j02.9");
    expect(screen.getByLabelText("Código CIE-10")).toHaveValue("J02.9");
    expect(screen.getByLabelText("Diagnóstico")).toHaveValue("Faringitis aguda, no especificada");
    await usuario.click(screen.getByRole("button", { name: "Guardar fórmula" }));
    expect(await esperarTexto("Agregue al menos un medicamento o una recomendación.")).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Recomendaciones (una por línea)"), "Tome agua.");
    await usuario.click(screen.getByRole("button", { name: "Guardar fórmula" }));
    expect(await esperarTexto("Fórmula registrada. Le avisamos al paciente por WhatsApp.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "PUT", "/admin/historia-clinica/ca-1/formula")[1].cuerpo).toMatchObject({
      diagnostico: "Faringitis aguda, no especificada",
      cie10: "J02.9",
      medicamentos: [],
      recomendaciones: ["Tome agua."],
    });
    expect(screen.getByRole("button", { name: "Corregir fórmula" })).toBeInTheDocument();
  });

  it("el médico no corrige la fórmula de otro médico", async () => {
    backendFalso({ "GET /admin/auth/me": COORDINACION, "GET /admin/historia-clinica/:id": historia({ puede_editar: false }) });
    abrir("/admin/historia-clinica/ca-1", { personal: true });
    expect(await screen.findByRole("heading", { name: "Rosa Martínez" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Corregir fórmula" })).not.toBeInTheDocument();
  });

  it("sin permiso (Call center): 'No tiene permiso…' y vuelve al detalle de la cita, sin pedir nada", async () => {
    const llamadas = backendFalso({ "GET /admin/auth/me": CALL_CENTER });
    abrir("/admin/historia-clinica/ca-1", { personal: true });
    expect(await screen.findByRole("heading", { name: "No tiene permiso para ver esta información" })).toBeInTheDocument();
    expect(screen.getByText(/solicite el acceso a Coordinación médica/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al detalle de la cita" })).toHaveAttribute("href", "/admin/citas/ca-1");
    expect(screen.queryByRole("link", { name: /Historia clínica/ })).not.toBeInTheDocument(); // no está en su menú
    expect(llamadasA(llamadas, "GET", "/admin/historia-clinica/ca-1")).toHaveLength(0);

    // El listado tampoco.
    backendFalso({ "GET /admin/auth/me": { ...PERSONAL, permisos: TODOS_LOS_PERMISOS } });
    abrir("/admin/historia-clinica", { personal: true });
    expect(await screen.findByRole("heading", { name: "No tiene permiso para ver esta información" })).toBeInTheDocument();
  });

  it("un médico con alguien que no es su paciente: el motivo que da el servidor", async () => {
    backendFalso({
      "GET /admin/auth/me": { ...COORDINACION, rol: "medico", rol_texto: "Médico" },
      "GET /admin/historia-clinica/:id": error(403, "Solo puede ver la historia clínica de sus pacientes."),
    });
    abrir("/admin/historia-clinica/ca-1", { personal: true });
    expect(await screen.findByRole("heading", { name: "No tiene permiso para ver esta información" })).toBeInTheDocument();
    expect(screen.getByText("Solo puede ver la historia clínica de sus pacientes.")).toBeInTheDocument();
  });

  it("Usuarios: con el rol Médico se elige qué médico de la red es", async () => {
    const ramirez = { id: "esp-r", nombre: "Dr. Carlos Ramírez", especialidad: ESPECIALIDAD, activo: true };
    const gomez = { id: "esp-g", nombre: "Dra. Ana Gómez", especialidad: ESPECIALIDAD, activo: true };
    const medico = { ...PERSONAL, id: "per-5", nombre: "Ana Gómez", rol: "medico", especialista_id: "esp-g", especialista: "Dra. Ana Gómez" };
    const llamadas = backendFalso({
      "GET /admin/usuarios": [PERSONAL, medico],
      "GET /admin/roles": [],
      "GET /admin/especialistas": [ramirez, gomez, { ...ramirez, id: "esp-x", nombre: "Inactivo", activo: false }],
      "POST /admin/usuarios": { id: "per-6" },
    });
    const usuario = abrir("/admin/usuarios", { personal: true });
    expect(await screen.findByText(/Solo los roles Médico y Coordinación médica pueden ver la historia clínica/)).toBeInTheDocument();
    expect(await screen.findByText("Dra. Ana Gómez", { selector: ".celda-doble__dato" })).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Nombre completo"), "Carlos Ramírez");
    await usuario.type(screen.getByLabelText("Correo institucional"), "carlos.r@saludya.co");
    await usuario.selectOptions(screen.getByLabelText("Rol"), "medico");
    // Solo los activos que todavía no tienen cuenta.
    const medicos = screen.getByLabelText("¿Qué médico es?");
    expect(within(medicos).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Elija el médico",
      "Dr. Carlos Ramírez · Cardiología",
    ]);
    await usuario.selectOptions(medicos, "esp-r");
    await usuario.type(screen.getByLabelText(/Contraseña inicial/), "clave-larga-123");
    await usuario.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await esperarTexto("Cuenta creada para Carlos Ramírez.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/usuarios")[0].cuerpo).toMatchObject({ rol: "medico", especialista_id: "esp-r" });
  });
});

describe("Detalle de la cita del personal", () => {
  it("una cita atendida lleva a su historia clínica (información reservada)", async () => {
    backendFalso({
      "GET /admin/citas/:id": {
        id: "ca-1", numero_comprobante: "SY-ADM1", especialidad_id: "esp-1", especialidad: "Cardiología",
        especialista: "Dr. Carlos Ramírez", sede: "Sede Poblado", ciudad: "Medellín", modalidad: "presencial",
        fecha: "2026-10-15", hora: "08:00:00", estado_visible: "atendida", estado_texto: "Atendida",
        canal_recordatorio: "whatsapp", recordatorio_enviado_en: null, riesgo: null,
        acciones: { confirmar: false, reprogramar: false, cancelar: false, recordatorio: false, contactar: false,
          registrar_resultado: false, observar: false },
        paciente: { id: "pac-1", nombre: "Mario Ruiz", tipo_documento: "cedula_ciudadania", numero_documento: "1010",
          telefono_whatsapp: "3009998877", correo: null, eps: "Sura", estado_afiliacion: "activa" },
        motivo_cancelacion: null, historial_estado: [], historial_asistencia: [],
        resumen_asistencia: { atendidas: 1, no_asistio: 0, canceladas: 0, reprogramadas: 0 },
        recordatorios: [], contactos: [], observaciones: [], auditoria: [],
      },
    });
    abrir("/admin/citas/ca-1", { personal: true });
    const tarjeta = await screen.findByRole("region", { name: "Historia clínica" });
    expect(within(tarjeta).getByText(/son información reservada/)).toBeInTheDocument();
    expect(within(tarjeta).getByRole("link", { name: "Ver diagnóstico y fórmula" })).toHaveAttribute(
      "href",
      "/admin/historia-clinica/ca-1"
    );
  });
});
