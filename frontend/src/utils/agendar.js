import { capitalizar } from "./formato";

/**
 * Cálculos del flujo "Agendar" (3 pasos: especialista, fecha y hora,
 * confirmar) a partir de los horarios libres que devuelve la API.
 */

export const sinTildes = (texto) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const fechaLocal = (fecha) => fecha.toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

function sumarDias(fechaIso, dias) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  fecha.setDate(fecha.getDate() + dias);
  return fechaLocal(fecha);
}

const esDomingo = (fechaIso) => new Date(`${fechaIso}T00:00:00`).getDay() === 0;

/** "Desde hoy", "Desde mañana", "Desde el viernes" (esta semana) o "Desde el 3 de nov" */
export function textoDesde(fechaIso, ahora = new Date()) {
  const hoy = fechaLocal(ahora);
  if (fechaIso <= hoy) return "Desde hoy";
  if (fechaIso === sumarDias(hoy, 1)) return "Desde mañana";
  const fecha = new Date(`${fechaIso}T00:00:00`);
  if (fechaIso < sumarDias(hoy, 7)) {
    return `Desde el ${new Intl.DateTimeFormat("es-CO", { weekday: "long" }).format(fecha)}`;
  }
  return `Desde el ${new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(fecha).replace(".", "")}`;
}

const claveHorario = (f) => `${f.fecha}T${f.hora}`;
const porHorario = (a, b) => claveHorario(a).localeCompare(claveHorario(b));

/** Los horarios agrupados por profesional, del que tiene el cupo más cercano al más lejano. */
export function agruparPorEspecialista(franjas) {
  const grupos = new Map();
  for (const franja of franjas) {
    const id = franja.especialista.id;
    if (!grupos.has(id)) grupos.set(id, { especialista: franja.especialista, franjas: [] });
    grupos.get(id).franjas.push(franja);
  }
  for (const grupo of grupos.values()) grupo.franjas.sort(porHorario);
  return [...grupos.values()].sort((a, b) => porHorario(a.franjas[0], b.franjas[0]));
}

/** Cada especialidad con cuántos profesionales tienen cupo y desde cuándo. */
export function resumenEspecialidades(especialidades, franjas, ahora = new Date()) {
  return especialidades.map((especialidad) => {
    const suyas = franjas.filter((f) => f.especialista.especialidad.id === especialidad.id);
    const profesionales = new Set(suyas.map((f) => f.especialista.id)).size;
    const primera = suyas.map((f) => f.fecha).sort()[0];
    return { ...especialidad, profesionales, desde: primera ? textoDesde(primera, ahora) : null };
  });
}

/**
 * Los días entre el primer y el último cupo del profesional, con cuántos
 * horarios tiene cada uno (0 = "Sin cupos"). Los domingos sin cupos no se
 * muestran: no se atiende.
 */
export function diasDelProfesional(franjas) {
  if (franjas.length === 0) return [];
  const fechas = franjas.map((f) => f.fecha).sort();
  const dias = [];
  for (let fecha = fechas[0]; fecha <= fechas.at(-1); fecha = sumarDias(fecha, 1)) {
    const cantidad = franjas.filter((f) => f.fecha === fecha).length;
    if (cantidad > 0 || !esDomingo(fecha)) dias.push({ fecha, cantidad });
  }
  return dias;
}

export const esDeManana = (horaIso) => Number(horaIso.slice(0, 2)) < 12;

/** "15:00:00" -> "3:00" (las horas van agrupadas en "Mañana" y "Tarde"). */
export function horaCorta(horaIso) {
  const [h, m] = horaIso.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

/** "Jue", 22 y "Octubre 2026" para la tira de días. */
export function partesDelDia(fechaIso) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  const dia = capitalizar(new Intl.DateTimeFormat("es-CO", { weekday: "short" }).format(fecha).replace(".", ""));
  const mes = capitalizar(new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(fecha));
  return { dia, numero: fecha.getDate(), mes };
}

/** "jue 22" */
export function diaCorto(fechaIso) {
  const { dia, numero } = partesDelDia(fechaIso);
  return `${dia.toLowerCase()} ${numero}`;
}

/** "Sede Poblado · Presencial", o "2 sedes · Presencial y virtual" si atiende en varias. */
export function dondeAtiende(franjas) {
  const sedes = [...new Set(franjas.map((f) => f.sede.nombre))];
  const modalidades = [...new Set(franjas.map((f) => f.modalidad))];
  const textoSedes = sedes.length === 1 ? sedes[0] : `${sedes.length} sedes`;
  const textoModalidades = modalidades.length === 1 ? capitalizar(modalidades[0]) : "Presencial y virtual";
  return `${textoSedes} · ${textoModalidades}`;
}

/** "Mujer" si el nombre empieza por "Dra." (para la silueta cuando no hay foto). */
export const esProfesionalMujer = (nombre) => /^dra\.?\s/i.test(nombre.trim());

/** "Dra. Laura Gómez" -> "Dra. Gómez" (para listas angostas). */
export function nombreCorto(nombre) {
  const partes = nombre.trim().split(/\s+/);
  return partes.length > 2 && /^dra?\.?$/i.test(partes[0]) ? `${partes[0]} ${partes.at(-1)}` : nombre;
}

/** "Hoy", "Mañana" o "Lun 3 nov": cuándo es la cita, contado desde hoy. */
export function cuandoEs(fechaIso, ahora = new Date()) {
  const hoy = fechaLocal(ahora);
  if (fechaIso === hoy) return "Hoy";
  if (fechaIso === sumarDias(hoy, 1)) return "Mañana";
  const { dia, numero } = partesDelDia(fechaIso);
  const mes = new Intl.DateTimeFormat("es-CO", { month: "short" }).format(new Date(`${fechaIso}T00:00:00`));
  return `${dia} ${numero} ${mes.replace(".", "")}`;
}

/** "hasta hoy a las 6:00 p. m.", "hasta mañana a las…" o "hasta el Lun 3 nov a las…" */
export function hastaCuando(fechaHoraIso, ahora = new Date()) {
  const fecha = new Date(fechaHoraIso).toLocaleDateString("en-CA");
  const dia = cuandoEs(fecha, ahora);
  const cuando = ["Hoy", "Mañana"].includes(dia) ? dia.toLowerCase() : `el ${dia}`;
  const hora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true }).format(
    new Date(fechaHoraIso)
  );
  return `hasta ${cuando} a las ${hora}`;
}
