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
