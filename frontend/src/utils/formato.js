export function formatearFecha(fechaIso) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  const texto = new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatearHora(horaIso) {
  const [h, m] = horaIso.split(":");
  const fecha = new Date();
  fecha.setHours(Number(h), Number(m), 0, 0);
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(fecha);
}

export function formatearDiaChip(fechaIso) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  const dia = new Intl.DateTimeFormat("es-CO", { weekday: "short" })
    .format(fecha)
    .replace(".", "")
    .toUpperCase();
  return { dia, numero: fecha.getDate() };
}

// "Martes, 29 de septiembre"
export function formatearFechaLarga(fechaIso) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  const texto = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// "SEPT" (para el bloque de fecha de las tarjetas de "Mis citas")
export function formatearMesCorto(fechaIso) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  return new Intl.DateTimeFormat("es-CO", { month: "short" })
    .format(fecha)
    .replace(".", "")
    .toUpperCase();
}

// Fecha y hora de un evento (ISO con zona), p. ej. "28 sept 2026, 3:40 p. m."
export function formatearFechaHora(fechaHoraIso) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(fechaHoraIso));
}

export function capitalizar(texto) {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// 66.7 -> "66,7 %"; sin datos -> "—"
export function formatearPorcentaje(valor) {
  return valor == null ? "—" : `${valor.toLocaleString("es-CO")} %`;
}

// Minutos -> "45 min", "3 h 20 min", "2 días 4 h"
export function formatearDuracion(minutos) {
  if (minutos == null) return "—";
  if (minutos < 60) return `${minutos} min`;
  const [dias, horas, mins] = [Math.floor(minutos / 1440), Math.floor((minutos % 1440) / 60), minutos % 60];
  if (dias) {
    const textoDias = `${dias} ${dias === 1 ? "día" : "días"}`;
    return horas ? `${textoDias} ${horas} h` : textoDias;
  }
  return mins ? `${horas} h ${mins} min` : `${horas} h`;
}
