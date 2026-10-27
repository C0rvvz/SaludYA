// Constantes y ayudas compartidas por "Mis citas" y el asistente.
import { formatearHora } from "./formato";

export const CANALES = {
  whatsapp: "WhatsApp",
  sms: "Mensaje de texto",
  correo: "Correo electrónico",
  llamada: "Llamada",
};

// Color de la insignia de cada estado (HU-18, criterio 4: estado claro).
export const CLASE_ESTADO = {
  pendiente_confirmar: "badge--warning",
  asistencia_confirmada: "badge--success",
  llegada_registrada: "badge--success",
  finalizada: "badge--neutral",
  atendida: "badge--success",
  no_asistio: "badge--error",
  cancelada: "badge--error",
  reprogramada: "badge--neutral",
};

// Citas que todavía van a ocurrir (o están ocurriendo). El resto forma
// el historial (HU-28). Debe coincidir con ESTADOS_ACTIVOS del backend.
export const ESTADOS_ACTIVOS = ["pendiente_confirmar", "asistencia_confirmada", "llegada_registrada"];

// Citas del historial desde las que se ofrece "Agendar de nuevo" (HU-30).
// No incluye "reprogramada": esa ya tiene su cita nueva.
export const ESTADOS_REAGENDABLES = ["atendida", "no_asistio", "cancelada", "finalizada"];

// "8:00 a. m." a partir de la fecha y hora (de Colombia) que envía el backend.
export const horaDe = (fechaHora) => formatearHora(fechaHora.split("T")[1]);

// HU-71: qué significa cada calificación de la atención.
export const CALIFICACIONES = { 1: "Muy mala", 2: "Mala", 3: "Regular", 4: "Buena", 5: "Excelente" };

// 4 -> "★★★★☆"
export const estrellas = (n) => "★".repeat(n) + "☆".repeat(5 - n);

// Estado en pocas palabras, para las insignias de "Mis citas" (el texto
// completo, estado_texto, va en la línea de tiempo y en el personal).
export const ESTADO_CORTO = {
  pendiente_confirmar: "Por confirmar",
  asistencia_confirmada: "Confirmada",
  llegada_registrada: "Llegó",
  finalizada: "En revisión",
  atendida: "Atendida",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
  reprogramada: "Reprogramada",
};

/**
 * Enlace a Google Maps para llegar a la sede. Las sedes todavía no tienen
 * dirección: se busca por el barrio o municipio ("Poblado, Medellín").
 */
export function enlaceComoLlegar(sede) {
  // Con la dirección exacta de la sede (si el personal la registró), el mapa llega a la puerta.
  const lugar = sede.direccion
    ? `${sede.direccion}, ${sede.ciudad}`
    : `${sede.nombre.replace(/^Sede\s+/i, "")}, ${sede.ciudad}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`;
}

/**
 * "Cómo llegar" a una farmacia donde reclamar la fórmula: a su dirección si
 * la tiene; si no, a su barrio ("Laureles, Medellín").
 */
export function enlaceAFarmacia(farmacia) {
  const lugar = `${farmacia.direccion ?? farmacia.barrio}, ${farmacia.ciudad}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`;
}

// Afiliación del paciente a su EPS, para el personal. "particular": no tiene EPS.
export const AFILIACION = {
  activa: "Activa",
  no_encontrada: "No encontrada",
  pendiente: "Pendiente",
  particular: "No aplica (particular)",
};

// La EPS del paciente para el personal, o "Particular (sin EPS)".
export const epsDelPaciente = (p) => p.eps ?? (p.estado_afiliacion === "particular" ? "Particular (sin EPS)" : "—");

// De qué es el valor de la cita (cita.tipo_cobro): copago de su EPS, de una aliada o particular.
export const TIPO_COBRO = {
  eps: "Copago de su EPS",
  aliada: "Copago EPS aliada",
  particular: "Consulta particular",
};

// Estado en pocas palabras para las tablas del personal, y cómo se llama
// cada grupo en los chips con contador de "Gestión de citas" (con su color).
export const ESTADO_PERSONAL = {
  pendiente_confirmar: "Pendiente",
  asistencia_confirmada: "Confirmada",
  llegada_registrada: "Llegó",
  finalizada: "Por registrar",
  atendida: "Atendida",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
  reprogramada: "Reprogramada",
};

export const GRUPOS_ESTADO = [
  ["pendiente_confirmar", "Pendientes de confirmación", "#e0a43a"],
  ["asistencia_confirmada", "Confirmadas", "#1f7a4d"],
  ["llegada_registrada", "Llegada registrada", "#1b5fa8"],
  ["finalizada", "Por registrar atención", "#9aa3ad"],
  ["atendida", "Atendidas", "#1f7a4d"],
  ["no_asistio", "No asistió", "#a33a2b"],
  ["cancelada", "Canceladas", "#c85a4a"],
  ["reprogramada", "Reprogramadas", "#9aa3ad"],
];
