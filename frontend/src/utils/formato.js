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

export function capitalizar(texto) {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
