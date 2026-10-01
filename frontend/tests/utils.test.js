import { describe, expect, it } from "vitest";
import { colorAvatar, iniciales } from "../src/utils/avatar";
import { CALIFICACIONES, ESTADOS_ACTIVOS, estrellas, horaDe } from "../src/utils/citas";
import {
  capitalizar,
  formatearDiaChip,
  formatearDuracion,
  formatearFecha,
  formatearFechaHora,
  formatearFechaLarga,
  formatearHora,
  formatearMesCorto,
  formatearPorcentaje,
} from "../src/utils/formato";
import { ESTADOS_SOLICITUD } from "../src/utils/solicitudes";
import {
  validarCodigoOtp,
  validarCorreo,
  validarNombre,
  validarNumeroDocumento,
  validarTelefonoWhatsapp,
} from "../src/utils/validaciones";

// Intl separa "a. m." con espacios especiales: se comparan como espacios normales.
const plano = (texto) => texto.replace(/\s/g, " ");

describe("formato", () => {
  it("fechas en español de Colombia", () => {
    expect(formatearFechaLarga("2026-09-29")).toBe("Martes, 29 de septiembre");
    expect(formatearFecha("2026-09-29")).toMatch(/^Mar/);
    expect(formatearDiaChip("2026-09-29")).toEqual({ dia: "MAR", numero: 29 });
    expect(formatearMesCorto("2026-09-29")).toMatch(/^SEPT?$/);
    expect(plano(formatearFechaHora("2026-09-28T15:40:00"))).toContain("3:40 p. m.");
  });

  it("horas de 12 horas", () => {
    expect(plano(formatearHora("08:00:00"))).toBe("8:00 a. m.");
    expect(plano(formatearHora("15:30"))).toBe("3:30 p. m.");
    expect(plano(horaDe("2026-10-01T07:15:00"))).toBe("7:15 a. m.");
  });

  it("porcentajes, duraciones y mayúscula inicial", () => {
    expect(formatearPorcentaje(66.7)).toBe("66,7 %");
    expect(formatearPorcentaje(null)).toBe("—");
    expect(formatearDuracion(null)).toBe("—");
    expect(formatearDuracion(45)).toBe("45 min");
    expect(formatearDuracion(200)).toBe("3 h 20 min");
    expect(formatearDuracion(120)).toBe("2 h");
    expect(formatearDuracion(1440)).toBe("1 día");
    expect(formatearDuracion(3120)).toBe("2 días 4 h");
    expect(capitalizar("presencial")).toBe("Presencial");
    expect(capitalizar("")).toBe("");
  });
});

describe("validaciones (las mismas reglas del backend)", () => {
  it("número de documento", () => {
    expect(validarNumeroDocumento("1020304050", "cedula_ciudadania")).toBe("");
    expect(validarNumeroDocumento("", "cedula_ciudadania")).toMatch(/Ingresa/);
    expect(validarNumeroDocumento("AB1234", "cedula_ciudadania")).toMatch(/solo dígitos/);
    expect(validarNumeroDocumento("AV123456", "pasaporte")).toBe("");
    expect(validarNumeroDocumento("AV-12", "pasaporte")).toMatch(/alfanuméricos/);
  });

  it("nombre, celular, correo y código", () => {
    expect(validarNombre(" ")).toMatch(/Ingresa/);
    expect(validarNombre("A")).toMatch(/2 caracteres/);
    expect(validarNombre("Ana")).toBe("");
    expect(validarTelefonoWhatsapp("")).toMatch(/Ingresa/);
    expect(validarTelefonoWhatsapp("300 123-4567")).toBe("");
    expect(validarTelefonoWhatsapp("2001234567")).toMatch(/celular colombiano/);
    expect(validarCorreo("")).toBe(""); // opcional
    expect(validarCorreo("ana@correo")).toMatch(/válido/);
    expect(validarCorreo("ana@correo.co")).toBe("");
    expect(validarCodigoOtp("")).toMatch(/Ingresa/);
    expect(validarCodigoOtp("123")).toMatch(/6 dígitos/);
    expect(validarCodigoOtp("123456")).toBe("");
  });
});

describe("avatar y constantes", () => {
  it("iniciales sin títulos y color estable", () => {
    expect(iniciales("Dra. Ana María Gómez")).toBe("AM");
    expect(iniciales("")).toBe("");
    expect(colorAvatar("Ana")).toBe(colorAvatar("Ana"));
    expect(colorAvatar("")).toMatch(/^#/);
  });

  it("estrellas y estados", () => {
    expect(estrellas(4)).toBe("★★★★☆");
    expect(CALIFICACIONES[5]).toBe("Excelente");
    expect(ESTADOS_ACTIVOS).toContain("pendiente_confirmar");
    expect(ESTADOS_SOLICITUD.aprobada[0]).toBe("Aprobada");
  });
});
