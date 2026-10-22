import { describe, expect, it } from "vitest";
import {
  cuandoEs,
  diasDelProfesional,
  dondeAtiende,
  esDeManana,
  esProfesionalMujer,
  horaCorta,
  nombreCorto,
  resumenEspecialidades,
  sinTildes,
  textoDesde,
} from "../src/utils/agendar";
import { iniciales } from "../src/utils/avatar";
import { CALIFICACIONES, ESTADO_CORTO, ESTADOS_ACTIVOS, enlaceComoLlegar, estrellas, horaDe } from "../src/utils/citas";
import {
  capitalizar,
  formatearDuracion,
  formatearFecha,
  formatearFechaHora,
  formatearFechaLarga,
  formatearHora,
  formatearMesCorto,
  formatearPorcentaje,
} from "../src/utils/formato";
import { FOTO_INICIO, proximosCupos, textoCuando } from "../src/utils/inicio";
import { ESTADOS_SOLICITUD } from "../src/utils/solicitudes";
import { franja, OTRO_ESPECIALISTA, OTRA_SEDE } from "./datos";
import {
  validarCodigoOtp,
  validarCorreo,
  validarNombre,
  validarNumeroDocumento,
  validarTelefonoWhatsapp,
} from "../src/utils/validaciones";

// Intl separa "a. m." con espacios especiales: se comparan como espacios normales.
const plano = (texto) => texto.replace(/\s/g, " ");

describe("próximos cupos del Home", () => {
  const AHORA = new Date("2026-10-21T09:00:00"); // miércoles

  it("dice cuándo en palabras: hoy, mañana o el día", () => {
    expect(plano(textoCuando("2026-10-21", "15:00:00", AHORA))).toBe("Hoy · 3:00 p. m.");
    expect(plano(textoCuando("2026-10-22", "08:30:00", AHORA))).toBe("Mañana, jueves 22 · 8:30 a. m.");
    expect(plano(textoCuando("2026-10-26", "14:30:00", AHORA))).toBe("Lunes 26 · 2:30 p. m.");
  });

  it("toma el horario más cercano de cada especialidad, con su foto", () => {
    const cupos = proximosCupos(
      [
        franja("tarde", "2026-10-23", "15:00:00"),
        franja("temprano", "2026-10-22", "08:00:00", { sede: OTRA_SEDE, modalidad: "virtual" }),
        franja("derma", "2026-10-24", "09:00:00", { especialista: OTRO_ESPECIALISTA }),
      ],
      AHORA
    );
    expect(cupos.map((c) => c.id)).toEqual(["temprano", "derma"]);
    expect(cupos[0]).toMatchObject({ especialidad: "Cardiología", lugar: "Sede Laureles · Virtual" });
    expect(cupos[0].foto).toContain("unsplash.com");
    expect(cupos[1].foto).not.toBe(FOTO_INICIO); // Dermatología tiene su propia foto
    expect(proximosCupos([], AHORA)).toEqual([]);
  });
});

describe("formato", () => {
  it("fechas en español de Colombia", () => {
    expect(formatearFechaLarga("2026-09-29")).toBe("Martes, 29 de septiembre");
    expect(formatearFecha("2026-09-29")).toMatch(/^Mar/);
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
  it("iniciales sin títulos", () => {
    expect(iniciales("Dra. Ana María Gómez")).toBe("AM");
    expect(iniciales("")).toBe("");
  });

  it("estrellas y estados", () => {
    expect(estrellas(4)).toBe("★★★★☆");
    expect(CALIFICACIONES[5]).toBe("Excelente");
    expect(ESTADOS_ACTIVOS).toContain("pendiente_confirmar");
    expect(ESTADOS_SOLICITUD.aprobada[0]).toBe("Aprobada");
  });
});

describe("agendar", () => {
  const HOY = new Date(2026, 9, 22, 9, 0); // jueves 22 de octubre

  it("desde cuándo hay cupo, en palabras", () => {
    expect(textoDesde("2026-10-22", HOY)).toBe("Desde hoy");
    expect(textoDesde("2026-10-23", HOY)).toBe("Desde mañana");
    expect(textoDesde("2026-10-26", HOY)).toBe("Desde el lunes");
    expect(textoDesde("2026-11-03", HOY)).toMatch(/^Desde el 3 de nov/);
  });

  it("cuántos profesionales tiene cada especialidad", () => {
    const franjas = [franja("a", "2026-10-26", "08:00:00"), franja("b", "2026-10-23", "09:00:00")];
    const [cardio, derma] = resumenEspecialidades(
      [{ id: "esp-1", nombre: "Cardiología" }, { id: "esp-2", nombre: "Dermatología" }],
      franjas,
      HOY
    );
    expect(cardio).toMatchObject({ profesionales: 1, desde: "Desde mañana" });
    expect(derma).toMatchObject({ profesionales: 0, desde: null });
  });

  it("los días del profesional: sin cupos se muestran, salvo los domingos", () => {
    const dias = diasDelProfesional([
      franja("a", "2026-10-23", "08:00:00"),
      franja("b", "2026-10-23", "15:00:00"),
      franja("c", "2026-10-26", "09:00:00"),
    ]);
    expect(dias).toEqual([
      { fecha: "2026-10-23", cantidad: 2 },
      { fecha: "2026-10-24", cantidad: 0 }, // sábado
      { fecha: "2026-10-26", cantidad: 1 },
    ]);
    expect(diasDelProfesional([])).toEqual([]);
  });

  it("horas, sedes, tildes y siluetas", () => {
    expect(horaCorta("15:00:00")).toBe("3:00");
    expect(horaCorta("00:30:00")).toBe("12:30");
    expect(esDeManana("11:59:00")).toBe(true);
    expect(esDeManana("12:00:00")).toBe(false);
    expect(dondeAtiende([franja("a", "2026-10-23", "08:00:00")])).toBe("Sede Poblado · Presencial");
    expect(
      dondeAtiende([
        franja("a", "2026-10-23", "08:00:00"),
        franja("b", "2026-10-23", "09:00:00", { sede: OTRA_SEDE, modalidad: "virtual" }),
      ])
    ).toBe("2 sedes · Presencial y virtual");
    expect(sinTildes("Ramírez")).toBe("ramirez");
    expect(esProfesionalMujer("Dra. Ana Gómez")).toBe(true);
    expect(esProfesionalMujer("Dr. Carlos Ramírez")).toBe(false);
  });
});

describe("mis citas", () => {
  it("cuándo es la cita, nombres cortos, estados cortos y cómo llegar", () => {
    const HOY = new Date(2026, 9, 22, 9, 0);
    expect(cuandoEs("2026-10-22", HOY)).toBe("Hoy");
    expect(cuandoEs("2026-10-23", HOY)).toBe("Mañana");
    expect(cuandoEs("2026-11-03", HOY)).toBe("Mar 3 nov");
    expect(nombreCorto("Dra. Laura María Gómez")).toBe("Dra. Gómez");
    expect(nombreCorto("Dr. Ruiz")).toBe("Dr. Ruiz");
    expect(nombreCorto("Laura Gómez Ruiz")).toBe("Laura Gómez Ruiz");
    expect(ESTADO_CORTO.pendiente_confirmar).toBe("Por confirmar");
    expect(enlaceComoLlegar({ nombre: "Sede Envigado", ciudad: "Envigado" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Envigado%2C%20Envigado"
    );
  });
});
