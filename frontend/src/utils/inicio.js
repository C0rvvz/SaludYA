import { capitalizar, formatearHora } from "./formato";

/**
 * Datos del carrusel "Próximo cupo" del Home: el horario libre más cercano
 * de cada especialidad, sacado en vivo de la API (no son datos inventados).
 */

// Fotos de ejemplo (Unsplash, libres de uso) del diseño. Reemplazar por
// fotos propias de las sedes y los profesionales.
const FOTO_GENERAL = "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=80&auto=format&fit=crop";
const FOTOS = {
  "medicina general": FOTO_GENERAL,
  pediatria: "https://unsplash.com/photos/QY8-IuUV3wk/download?w=1400",
  cardiologia: "https://unsplash.com/photos/Q3J1wmn7_8w/download?w=1400",
  dermatologia: "https://images.unsplash.com/photo-1584515933487-779824d29309?w=1200&q=80&auto=format&fit=crop",
};

export const FOTO_INICIO = FOTO_GENERAL;

const MAXIMO = 5;

const sinTildes = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fechaLocal = (fecha) => fecha.toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

/** "Hoy · 3:00 p. m.", "Mañana, jueves 22 · 8:30 a. m." o "Viernes 23 · 10:00 a. m." */
export function textoCuando(fechaIso, horaIso, ahora = new Date()) {
  const hoy = fechaLocal(ahora);
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  const hora = formatearHora(horaIso);
  if (fechaIso === hoy) return `Hoy · ${hora}`;

  const dia = new Date(`${fechaIso}T00:00:00`);
  const nombreDia = new Intl.DateTimeFormat("es-CO", { weekday: "long" }).format(dia);
  const cuando = `${nombreDia} ${dia.getDate()} · ${hora}`;
  return fechaIso === fechaLocal(manana) ? `Mañana, ${cuando}` : capitalizar(cuando);
}

/** El primer horario libre de cada especialidad (hasta 5), del más cercano al más lejano. */
export function proximosCupos(franjas, ahora = new Date()) {
  const ordenadas = [...franjas].sort((a, b) => `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`));
  const porEspecialidad = new Map();
  for (const franja of ordenadas) {
    const especialidad = franja.especialista.especialidad.nombre;
    if (!porEspecialidad.has(especialidad)) porEspecialidad.set(especialidad, franja);
  }
  return [...porEspecialidad.values()].slice(0, MAXIMO).map((franja) => {
    const especialidad = franja.especialista.especialidad.nombre;
    return {
      id: franja.id,
      especialidad,
      cuando: textoCuando(franja.fecha, franja.hora, ahora),
      lugar: `${franja.sede.nombre} · ${capitalizar(franja.modalidad)}`,
      foto: FOTOS[sinTildes(especialidad)] ?? FOTO_GENERAL,
    };
  });
}
