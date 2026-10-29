import { capitalizar, formatearHora } from "./formato";

/**
 * Datos del carrusel "Próximo cupo" del Home: el horario libre más cercano
 * de cada especialidad, sacado en vivo de la API (no son datos inventados).
 */

// Una foto por especialidad (Unsplash, licencia gratuita de uso libre; cada
// una muestra esa atención: el examen de la vista, la radiografía de tórax,
// el glucómetro...). Reemplazar por fotos propias de las sedes y los
// profesionales. La que no tenga la suya usa la de una consulta médica.
const foto = (id) => `https://unsplash.com/photos/${id}/download?w=1400`;
const FOTO_GENERAL = foto("tl447mekwuQ"); // médico conversando con un paciente en el consultorio
const FOTOS = {
  "medico general": FOTO_GENERAL,
  "medicina general": FOTO_GENERAL,
  "medicina interna": foto("Ey-IxmbZ5TQ"),
  geriatria: foto("Ey-IxmbZ5TQ"),
  pediatria: foto("EiL21cqvo58"),
  cardiologia: foto("NDOYHZ_98Rw"),
  dermatologia: foto("PNdOpC-6q-I"),
  ortopedia: foto("a3JgvyM-lzo"),
  odontologia: foto("Bg81yWKZlMg"),
  oftalmologia: foto("Y0D5L-qKUcw"),
  optometria: foto("QSqphOrPako"),
  psicologia: foto("rG5elqddGzo"),
  psiquiatria: foto("QxkvMblcaJ0"),
  fisioterapia: foto("pbUWW-CBoqY"),
  "ginecologia y obstetricia": foto("87ev1NvhDsU"),
  "nutricion y dietetica": foto("IGfIGP5ONV0"),
  neurologia: foto("AB0r9z7eRYg"),
  endocrinologia: foto("O9Ygl6vmWhk"),
  neumologia: foto("0Sk3qI4oI0c"),
  gastroenterologia: foto("iyeUwItlIPk"),
  reumatologia: foto("S52_QspnHYI"),
  otorrinolaringologia: foto("nlj0xvTlk0s"),
  urologia: foto("8WYkI3cEZm8"),
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
