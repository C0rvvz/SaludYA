import { capitalizar, formatearHora } from "./formato";

/**
 * Datos del carrusel "Próximo cupo" del Home: el horario libre más cercano
 * de cada especialidad, sacado en vivo de la API (no son datos inventados).
 */

// Fotos de ejemplo (Unsplash, libres de uso) del diseño. Reemplazar por
// fotos propias de las sedes y los profesionales.
const FOTO_GENERAL = "https://unsplash.com/photos/EiL21cqvo58/download?w=1400";
const FOTOS = {
  "medico general": FOTO_GENERAL,
  "medicina general": FOTO_GENERAL,
  pediatria: "https://unsplash.com/photos/QY8-IuUV3wk/download?w=1400",
  cardiologia: "https://unsplash.com/photos/Q3J1wmn7_8w/download?w=1400",
  dermatologia: "https://unsplash.com/photos/PNdOpC-6q-I/download?w=1400",
  ortopedia: "https://images.pexels.com/photos/263357/pexels-photo-263357.jpeg?auto=compress&cs=tinysrgb&w=1400",
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
