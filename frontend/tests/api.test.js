import { beforeEach, describe, expect, it, vi } from "vitest";
import * as admin from "../src/api/admin";
import * as auth from "../src/api/auth";
import * as catalogo from "../src/api/catalogo";
import * as chat from "../src/api/chat";
import * as citas from "../src/api/citas";
import { ApiError, apiFetch, TOKEN_PACIENTE, TOKEN_PERSONAL } from "../src/api/client";
import * as eps from "../src/api/eps";
import * as listaEspera from "../src/api/listaEspera";
import * as pacientes from "../src/api/pacientes";
import * as solicitudes from "../src/api/solicitudes";

const API = "http://api.test";

function respuesta(status, cuerpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: cuerpo === undefined ? () => Promise.reject(new SyntaxError("sin cuerpo")) : () => Promise.resolve(cuerpo),
  };
}

let fetchFalso;
beforeEach(() => {
  fetchFalso = vi.fn(() => Promise.resolve(respuesta(200, { ok: true })));
  vi.stubGlobal("fetch", fetchFalso);
  localStorage.setItem(TOKEN_PACIENTE, "token-paciente");
  localStorage.setItem(TOKEN_PERSONAL, "token-personal");
});

describe("apiFetch", () => {
  it("envía JSON sin caché y devuelve la respuesta", async () => {
    expect(await apiFetch("/x", { method: "POST", body: { a: 1 } })).toEqual({ ok: true });
    const [url, opciones] = fetchFalso.mock.calls[0];
    expect(url).toBe(`${API}/x`);
    expect(opciones).toMatchObject({ method: "POST", body: '{"a":1}', cache: "no-store" });
    expect(opciones.headers.Authorization).toBeUndefined();
  });

  it("usa el token del paciente o el del personal, nunca los mezcla", async () => {
    await apiFetch("/p", { auth: true });
    await apiFetch("/q", { auth: "personal" });
    expect(fetchFalso.mock.calls[0][1].headers.Authorization).toBe("Bearer token-paciente");
    expect(fetchFalso.mock.calls[1][1].headers.Authorization).toBe("Bearer token-personal");
    localStorage.clear();
    await apiFetch("/r", { auth: true });
    expect(fetchFalso.mock.calls[2][1].headers.Authorization).toBeUndefined();
  });

  it("traduce los errores del backend a mensajes legibles", async () => {
    fetchFalso.mockResolvedValueOnce(respuesta(409, { detail: "Ese horario ya no está disponible." }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 409, message: "Ese horario ya no está disponible." });

    fetchFalso.mockResolvedValueOnce(respuesta(422, { detail: [{ msg: "Campo requerido." }, { msg: "Otro." }] }));
    await expect(apiFetch("/x")).rejects.toThrow("Campo requerido. Otro.");

    fetchFalso.mockResolvedValueOnce(respuesta(500, undefined));
    await expect(apiFetch("/x")).rejects.toThrow("Ocurrió un error inesperado.");

    fetchFalso.mockResolvedValueOnce(respuesta(400, { detail: { raro: true } }));
    await expect(apiFetch("/x")).rejects.toThrow("Ocurrió un error inesperado.");
  });

  it("sin conexión da un mensaje entendible", async () => {
    fetchFalso.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const error = await apiFetch("/x").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/No fue posible conectar/);
  });

  it("una respuesta correcta sin cuerpo devuelve null", async () => {
    fetchFalso.mockResolvedValueOnce(respuesta(204, undefined));
    expect(await apiFetch("/x", { method: "DELETE" })).toBeNull();
    expect(new ApiError(400, { no: "texto" }).message).toBe("Ocurrió un error inesperado.");
  });
});

// [función, argumentos, ruta, método, cuerpo, token]
const ID = "id-1";
const LLAMADAS = [
  [auth.identificarPaciente, ["123"], "/auth/paciente/identificar", "POST", { numero_documento: "123" }, null],
  [auth.enviarOtp, ["123"], "/auth/paciente/otp/enviar", "POST", { numero_documento: "123" }, null],
  [auth.reenviarOtp, ["123"], "/auth/paciente/otp/reenviar", "POST", { numero_documento: "123" }, null],
  [auth.validarOtp, ["123", "999999"], "/auth/paciente/otp/validar", "POST", { numero_documento: "123", codigo: "999999" }, null],
  [auth.obtenerPacienteActual, [], "/auth/paciente/me", "GET", undefined, "paciente"],
  [catalogo.listarEspecialidades, [], "/especialidades", "GET", undefined, null],
  [catalogo.listarSedes, [], "/sedes", "GET", undefined, null],
  [catalogo.buscarDisponibilidad, [{ especialidad_id: "e", fecha: "", ciudad: "Medellín" }], "/disponibilidad/buscar?especialidad_id=e&ciudad=Medell%C3%ADn", "GET", undefined, null],
  [catalogo.buscarDisponibilidad, [], "/disponibilidad/buscar", "GET", undefined, null],
  [catalogo.listarEspecialistas, ["e"], "/especialistas?especialidad_id=e", "GET", undefined, null],
  [chat.enviarMensaje, ["hola"], "/chat", "POST", { mensaje: "hola" }, "paciente"],
  [chat.obtenerConversacion, [], "/chat", "GET", undefined, "paciente"],
  [chat.reiniciarConversacion, [], "/chat", "DELETE", undefined, "paciente"],
  [citas.confirmarCita, ["d", "sms"], "/citas", "POST", { disponibilidad_id: "d", canal_recordatorio: "sms" }, "paciente"],
  [citas.obtenerComprobante, [ID], `/citas/${ID}/comprobante`, "GET", undefined, "paciente"],
  [citas.listarMisCitas, [], "/citas?vista=todas", "GET", undefined, "paciente"],
  [citas.listarMisCitas, ["historial"], "/citas?vista=historial", "GET", undefined, "paciente"],
  [citas.obtenerMiCita, [ID], `/citas/${ID}`, "GET", undefined, "paciente"],
  [citas.confirmarAsistencia, [ID], `/citas/${ID}/confirmar-asistencia`, "POST", undefined, "paciente"],
  [citas.registrarLlegada, [ID], `/citas/${ID}/registrar-llegada`, "POST", undefined, "paciente"],
  [citas.confirmarAsistenciaPorEnlace, ["tk"], "/citas/confirmar-asistencia/enlace", "POST", { token: "tk" }, null],
  [citas.cancelarCita, [ID, ""], `/citas/${ID}/cancelar`, "POST", { motivo: null }, "paciente"],
  [citas.reprogramarCita, [ID, "d"], `/citas/${ID}/reprogramar`, "POST", { disponibilidad_id: "d" }, "paciente"],
  [citas.calificarCita, [ID, 5, ""], `/citas/${ID}/calificar`, "POST", { calificacion: 5, comentario: null }, "paciente"],
  [eps.listarEps, [], "/eps", "GET", undefined, null],
  [listaEspera.listarMiListaEspera, [], "/lista-espera", "GET", undefined, "paciente"],
  [listaEspera.unirseListaEspera, [{ a: 1 }], "/lista-espera", "POST", { a: 1 }, "paciente"],
  [listaEspera.aceptarCupo, [ID], `/lista-espera/${ID}/aceptar`, "POST", undefined, "paciente"],
  [listaEspera.rechazarCupo, [ID], `/lista-espera/${ID}/rechazar`, "POST", undefined, "paciente"],
  [listaEspera.salirListaEspera, [ID], `/lista-espera/${ID}/salir`, "POST", undefined, "paciente"],
  [pacientes.registrarPaciente, [{ a: 1 }], "/pacientes/registro", "POST", { a: 1 }, null],
  [solicitudes.listarMisSolicitudes, [], "/solicitudes", "GET", undefined, "paciente"],
  [solicitudes.radicarSolicitud, [{ a: 1 }], "/solicitudes", "POST", { a: 1 }, "paciente"],
  [admin.iniciarSesionPersonal, ["c", "p"], "/admin/auth/login", "POST", { correo: "c", password: "p" }, null],
  [admin.obtenerPersonalActual, [], "/admin/auth/me", "GET", undefined, "personal"],
  [admin.listarUsuarios, [], "/admin/usuarios", "GET", undefined, "personal"],
  [admin.crearUsuario, [{ a: 1 }], "/admin/usuarios", "POST", { a: 1 }, "personal"],
  [admin.actualizarUsuario, [ID, { a: 1 }], `/admin/usuarios/${ID}`, "PATCH", { a: 1 }, "personal"],
  [admin.listarCitasAdmin, [{ estado: "cancelada", buscar: "" }], "/admin/citas?estado=cancelada", "GET", undefined, "personal"],
  [admin.listarCitasAdmin, [], "/admin/citas", "GET", undefined, "personal"],
  [admin.obtenerCitaAdmin, [ID], `/admin/citas/${ID}`, "GET", undefined, "personal"],
  [admin.confirmarCitaAdmin, [ID], `/admin/citas/${ID}/confirmar`, "POST", undefined, "personal"],
  [admin.cancelarCitaAdmin, [ID, ""], `/admin/citas/${ID}/cancelar`, "POST", { motivo: null }, "personal"],
  [admin.reprogramarCitaAdmin, [ID, "d"], `/admin/citas/${ID}/reprogramar`, "POST", { disponibilidad_id: "d" }, "personal"],
  [admin.enviarRecordatorioAdmin, [ID], `/admin/citas/${ID}/recordatorio`, "POST", undefined, "personal"],
  [admin.registrarContactoAdmin, [ID, "contesto", ""], `/admin/citas/${ID}/contacto`, "POST", { resultado: "contesto", nota: null }, "personal"],
  [admin.registrarResultadoAdmin, [ID, "atendida"], `/admin/citas/${ID}/resultado`, "POST", { resultado: "atendida" }, "personal"],
  [admin.agregarObservacionAdmin, ["p", "nota", ""], "/admin/pacientes/p/observaciones", "POST", { texto: "nota", cita_id: null }, "personal"],
  [admin.listarAuditoria, [{ cita_id: "c" }], "/admin/auditoria?cita_id=c", "GET", undefined, "personal"],
  [admin.listarAuditoria, [], "/admin/auditoria", "GET", undefined, "personal"],
  [admin.obtenerReporte, ["mes"], "/admin/reportes?periodo=mes", "GET", undefined, "personal"],
  [admin.listarRecordatorios, [], "/admin/recordatorios", "GET", undefined, "personal"],
  [admin.obtenerPlantillas, ["p", "c"], "/admin/recordatorios/plantillas?paciente_id=p&cita_id=c", "GET", undefined, "personal"],
  [admin.obtenerPlantillas, ["p"], "/admin/recordatorios/plantillas?paciente_id=p", "GET", undefined, "personal"],
  [admin.listarProgramados, [], "/admin/recordatorios/programados", "GET", undefined, "personal"],
  [admin.programarRecordatorio, [{ a: 1 }], "/admin/recordatorios/programados", "POST", { a: 1 }, "personal"],
  [admin.editarRecordatorio, [ID, { a: 1 }], `/admin/recordatorios/programados/${ID}`, "PUT", { a: 1 }, "personal"],
  [admin.cancelarRecordatorio, [ID], `/admin/recordatorios/programados/${ID}/cancelar`, "POST", undefined, "personal"],
  [admin.reintentarRecordatorio, [ID], `/admin/recordatorios/programados/${ID}/reintentar`, "POST", undefined, "personal"],
  [admin.listarListaEsperaAdmin, ["2026-10-01"], "/admin/lista-espera?dia=2026-10-01", "GET", undefined, "personal"],
  [admin.listarListaEsperaAdmin, [], "/admin/lista-espera", "GET", undefined, "personal"],
  [admin.horariosListaEspera, [ID], `/admin/lista-espera/${ID}/horarios`, "GET", undefined, "personal"],
  [admin.cambiarPrioridadListaEspera, [ID, "alta"], `/admin/lista-espera/${ID}/prioridad`, "PATCH", { prioridad: "alta" }, "personal"],
  [admin.confirmarDesdeListaEspera, [ID, "d"], `/admin/lista-espera/${ID}/confirmar`, "POST", { disponibilidad_id: "d" }, "personal"],
  [admin.cancelarDesdeListaEspera, [ID, ""], `/admin/lista-espera/${ID}/cancelar`, "POST", { motivo: null }, "personal"],
  [admin.listarSolicitudesAdmin, [], "/admin/solicitudes", "GET", undefined, "personal"],
  [admin.obtenerRevisionClinica, [ID], `/admin/solicitudes/${ID}`, "GET", undefined, "personal"],
  [admin.aprobarSolicitud, [ID, { a: 1 }], `/admin/solicitudes/${ID}/aprobar`, "POST", { a: 1 }, "personal"],
  [admin.enviarSolicitudEps, [ID, ""], `/admin/solicitudes/${ID}/enviar-eps`, "POST", { respuesta: null }, "personal"],
  [admin.negarSolicitud, [ID, "No aplica"], `/admin/solicitudes/${ID}/negar`, "POST", { respuesta: "No aplica" }, "personal"],
];

describe("cada llamada a la API usa la ruta, el método y la sesión correctos", () => {
  it.each(LLAMADAS)("%o", async (funcion, args, ruta, metodo, cuerpo, token) => {
    await funcion(...args);
    const [url, opciones] = fetchFalso.mock.calls[0];
    expect(url).toBe(`${API}${ruta}`);
    expect(opciones.method).toBe(metodo);
    expect(opciones.body).toBe(cuerpo === undefined ? undefined : JSON.stringify(cuerpo));
    const esperado = token && `Bearer token-${token}`;
    expect(opciones.headers.Authorization).toBe(esperado ?? undefined);
  });
});
