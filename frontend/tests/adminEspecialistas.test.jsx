import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrir, backendFalso, error, esperarTexto, llamadasA } from "./backendFalso";
import { ESPECIALIDAD, SEDE } from "./datos";
import { resumenHorario } from "../src/utils/especialistas";

const CARLOS = {
  id: "esp-a",
  nombre: "Dr. Carlos Ramírez",
  especialidad_id: "esp-1",
  especialidad: "Cardiología",
  registro_medico: "05-104233",
  activo: true,
  origen: "semilla",
  creado_en: "2026-09-01T10:00:00-05:00",
  sedes: ["Sede Poblado"],
  turnos: [
    { dia_semana: 0, sede_id: "sede-1", sede: "Sede Poblado", modalidad: "presencial", hora_inicio: "07:00:00", hora_fin: "12:00:00", duracion_minutos: 30 },
    { dia_semana: 2, sede_id: "sede-1", sede: "Sede Poblado", modalidad: "presencial", hora_inicio: "07:00:00", hora_fin: "12:00:00", duracion_minutos: 30 },
    { dia_semana: 4, sede_id: "sede-1", sede: "Sede Poblado", modalidad: "virtual", hora_inicio: "08:00:00", hora_fin: "11:00:00", duracion_minutos: 30 },
  ],
  cupos_libres: 42,
  citas_proximas: 3,
};
const RETIRADA = { ...CARLOS, id: "esp-b", nombre: "Dra. Sara Builes", activo: false, origen: "ips", cupos_libres: 0, citas_proximas: 0 };

function panel(cambios = {}) {
  return {
    especialistas: [CARLOS, RETIRADA],
    sincronizaciones: [
      {
        id: "s1", fecha: "2026-10-24T09:00:00-05:00", origen: "manual", solicitada_por: "Ana Admin (Administrador)",
        especialistas_nuevos: 2, especialistas_retirados: 1, franjas_creadas: 120, desde: "2026-10-26", hasta: "2026-11-06",
        detalle: "Llegaron: Dra. Paula Andrea Restrepo (Pediatría)",
      },
    ],
    proxima_automatica: "2026-11-03T09:00:00-05:00",
    dias_entre_actualizaciones: 10,
    ...cambios,
  };
}

describe("Especialistas", () => {
  it("resume el horario semanal juntando los días iguales", () => {
    expect(resumenHorario(CARLOS.turnos)).toEqual([
      "Lun y mié · 7:00 a. m. a 12:00 p. m. · Poblado",
      "Vie · 8:00 a. m. a 11:00 a. m. · Poblado (virtual)",
    ]);
  });

  it("muestra la red, las actualizaciones de la IPS y filtra por estado", async () => {
    backendFalso({
      "GET /admin/especialistas": panel(),
      "GET /especialidades": [ESPECIALIDAD],
      "GET /sedes": [SEDE],
    });
    const usuario = abrir("/admin/especialistas", { personal: true });
    expect(await screen.findByText("Dr. Carlos Ramírez")).toBeInTheDocument();
    expect(screen.getByText("Registro 05-104233 · Catálogo inicial")).toBeInTheDocument();
    expect(screen.getByText("42 horarios libres")).toBeInTheDocument();
    expect(screen.queryByText("Dra. Sara Builes")).not.toBeInTheDocument(); // empieza en "Activos"
    await usuario.click(screen.getByRole("button", { name: "Inactivos 1" }));
    expect(screen.getByText("Dra. Sara Builes")).toBeInTheDocument();

    const ips = screen.getByRole("heading", { name: "Actualizaciones de la IPS" }).closest("section");
    expect(within(ips).getByText("Pedida por Ana Admin (Administrador)")).toBeInTheDocument();
    expect(within(ips).getByText(/2 nuevos · 1 retirado · 120 horarios nuevos/)).toBeInTheDocument();
  });

  it("agrega un especialista con su horario y simula la IPS", async () => {
    const llamadas = backendFalso({
      "GET /admin/especialistas": panel(),
      "GET /especialidades": [ESPECIALIDAD],
      "GET /sedes": [SEDE],
      "POST /admin/especialistas": ({ cuerpo }) =>
        cuerpo.turnos.length > 1 && cuerpo.turnos[0].dia_semana === cuerpo.turnos[1].dia_semana
          ? error(400, "Los turnos del lunes se cruzan: el especialista no puede estar en dos lugares a la vez.")
          : { ...CARLOS, id: "esp-c", nombre: `${cuerpo.tratamiento} ${cuerpo.nombre}`, cupos_libres: 30 },
      "POST /admin/especialistas/sincronizar-ips": {
        ...panel().sincronizaciones[0], detalle: "Llegaron: Dr. Camilo Agudelo (Médico general).", franjas_creadas: 60,
      },
    });
    const usuario = abrir("/admin/especialistas", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Agregar especialista" }));
    const formulario = screen.getByRole("heading", { name: "Nuevo especialista" }).closest("form");
    await usuario.selectOptions(within(formulario).getByLabelText("Tratamiento"), "Dra.");
    await usuario.type(within(formulario).getByLabelText("Nombre completo"), "Paula Restrepo");
    await usuario.click(within(formulario).getByRole("button", { name: "Agregar turno" }));
    await usuario.selectOptions(within(formulario).getByLabelText("Día del turno 2"), "0"); // el mismo lunes
    await usuario.click(within(formulario).getByRole("button", { name: "Guardar especialista" }));
    expect(await esperarTexto(/no puede estar en dos lugares a la vez/)).toBeInTheDocument();

    await usuario.click(within(formulario).getByRole("button", { name: "Quitar el turno 2" }));
    await usuario.click(within(formulario).getByRole("button", { name: "Guardar especialista" }));
    expect(await esperarTexto("Se agregó a Dra. Paula Restrepo: ya tiene 30 horarios libres para agendar.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/especialistas").at(-1).cuerpo).toEqual({
      tratamiento: "Dra.",
      nombre: "Paula Restrepo",
      especialidad_id: "esp-1",
      registro_medico: null,
      turnos: [
        { dia_semana: 0, sede_id: "sede-1", modalidad: "presencial", hora_inicio: "07:00", hora_fin: "12:00", duracion_minutos: 20 },
      ],
    });

    await usuario.click(screen.getByRole("button", { name: "Simular actualización de la IPS" }));
    expect(await esperarTexto(/La IPS envió su actualización\. Llegaron: Dr\. Camilo Agudelo/)).toBeInTheDocument();
  });

  it("cambia el horario y desactiva con confirmación", async () => {
    const llamadas = backendFalso({
      "GET /admin/especialistas": panel(),
      "GET /especialidades": [ESPECIALIDAD],
      "GET /sedes": [SEDE],
      "PUT /admin/especialistas/:id/horario": { ...CARLOS, cupos_libres: 20 },
      "PATCH /admin/especialistas/:id/estado": { ...CARLOS, activo: false },
    });
    const usuario = abrir("/admin/especialistas", { personal: true });
    await usuario.click(await screen.findByRole("button", { name: "Cambiar el horario de Dr. Carlos Ramírez" }));
    expect(screen.getByText(/Las citas ya agendadas se conservan/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Quitar el turno 3" }));
    await usuario.click(screen.getByRole("button", { name: "Guardar horario" }));
    expect(await esperarTexto("Horario de Dr. Carlos Ramírez actualizado: 20 horarios libres.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "PUT", "/admin/especialistas/esp-a/horario")[0].cuerpo.turnos).toHaveLength(2);

    await usuario.click(screen.getByRole("button", { name: "Desactivar a Dr. Carlos Ramírez" }));
    expect(screen.getByText(/Sus 3 citas ya agendadas se conservan/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Sí, desactivar" }));
    expect(await esperarTexto("Dr. Carlos Ramírez quedó inactivo.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "PATCH", "/admin/especialistas/esp-a/estado")[0].cuerpo).toEqual({ activo: false });
  });
});

describe("Sedes de la red", () => {
  const POBLADO = {
    id: "sede-1", nombre: "Sede Poblado", ciudad: "Medellín", direccion: null, activa: true,
    especialistas: ["Dr. Carlos Ramírez"], citas_proximas: 4,
  };

  it("agrega, edita y no deja cerrar una sede donde alguien atiende", async () => {
    const llamadas = backendFalso({
      "GET /admin/especialistas": panel(),
      "GET /especialidades": [ESPECIALIDAD],
      "GET /sedes": [SEDE],
      "GET /admin/sedes": [POBLADO],
      "POST /admin/sedes": ({ cuerpo }) => ({ ...POBLADO, id: "sede-9", ...cuerpo, especialistas: [], citas_proximas: 0 }),
      "PUT /admin/sedes/:id": ({ cuerpo }) => ({ ...POBLADO, ...cuerpo }),
      "PATCH /admin/sedes/:id/estado": error(400, "Antes de cerrar Sede Poblado, cambie el horario de: Dr. Carlos Ramírez."),
    });
    const usuario = abrir("/admin/especialistas", { personal: true });
    const sedes = (await screen.findByRole("heading", { name: "Sedes de la red" })).closest("section");
    expect(await within(sedes).findByText("Dr. Carlos Ramírez")).toBeInTheDocument();
    expect(within(sedes).getByText("Sin dirección")).toBeInTheDocument();

    await usuario.click(within(sedes).getByRole("button", { name: "Agregar sede" }));
    const nueva = within(sedes).getByRole("form", { name: "Nueva sede" });
    await usuario.type(within(nueva).getByLabelText("Nombre"), "Sede Bello");
    await usuario.type(within(nueva).getByLabelText("Ciudad"), "Bello");
    await usuario.click(within(nueva).getByRole("button", { name: "Guardar sede" }));
    expect(await esperarTexto("Se agregó Sede Bello.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "POST", "/admin/sedes")[0].cuerpo).toEqual({ nombre: "Sede Bello", ciudad: "Bello", direccion: null });

    await usuario.click(within(sedes).getByRole("button", { name: "Editar Sede Poblado" }));
    const edicion = within(sedes).getByRole("form", { name: "Editar Sede Poblado" });
    await usuario.type(within(edicion).getByLabelText("Dirección (opcional)"), "Cra. 43A # 7-50");
    await usuario.click(within(edicion).getByRole("button", { name: "Guardar sede" }));
    expect(await esperarTexto("Sede Poblado actualizada.")).toBeInTheDocument();
    expect(llamadasA(llamadas, "PUT", "/admin/sedes/sede-1")[0].cuerpo.direccion).toBe("Cra. 43A # 7-50");

    await usuario.click(within(sedes).getByRole("button", { name: "Cerrar Sede Poblado" }));
    expect(within(sedes).getByText(/Sus 4 citas ya agendadas se conservan/)).toBeInTheDocument();
    await usuario.click(within(sedes).getByRole("button", { name: "Sí, cerrar la sede" }));
    expect(await esperarTexto(/cambie el horario de: Dr\. Carlos Ramírez/)).toBeInTheDocument();
  });
});
