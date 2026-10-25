import { formatearHora } from "./formato";

// Textos de "Especialistas" (panel del personal) y de la IPS simulada.

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb"];

export const DURACIONES = [15, 20, 30, 40, 60];

export const ORIGEN_ESPECIALISTA = {
  semilla: "Catálogo inicial",
  ips: "Llegó por la IPS",
  manual: "Agregado por el personal",
};

/** "Automática", "Carga inicial" o "Pedida por Ana Admin (Administrador)" */
export function origenSincronizacion(s) {
  if (s.origen === "automatica") return "Automática";
  if (s.origen === "inicial") return "Carga inicial";
  return `Pedida por ${s.solicitada_por}`;
}

// "Lun, mié y vie"
function listaDeDias(dias) {
  const nombres = dias.map((d) => DIAS_CORTOS[d]);
  const texto = nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : nombres[0];
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * El horario semanal en pocas líneas: los turnos iguales de distintos días
 * se juntan. "Lun y mié · 7:00 a. m. a 12:00 p. m. · Poblado"
 */
export function resumenHorario(turnos) {
  const grupos = new Map();
  for (const t of turnos) {
    const clave = [t.sede, t.modalidad, t.hora_inicio, t.hora_fin].join("|");
    if (!grupos.has(clave)) grupos.set(clave, { ...t, dias: [] });
    grupos.get(clave).dias.push(t.dia_semana);
  }
  return [...grupos.values()].map(
    (g) =>
      `${listaDeDias(g.dias)} · ${formatearHora(g.hora_inicio)} a ${formatearHora(g.hora_fin)} · ` +
      `${g.sede.replace(/^Sede\s+/i, "")}${g.modalidad === "virtual" ? " (virtual)" : ""}`
  );
}
