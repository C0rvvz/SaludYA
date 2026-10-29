/**
 * Desplazamientos de la página: suaves, para que la persona vea hacia dónde
 * la llevamos, salvo que haya pedido menos movimiento en su equipo
 * (accesibilidad: "Reducir movimiento").
 */

const movimiento = () => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** Sube al inicio de la página. */
export function subirAlInicio() {
  window.scrollTo({ top: 0, behavior: movimiento() });
}

/**
 * Lleva a la vista el comienzo de un elemento (el detalle de una cita, un
 * aviso), solo si no se ve ya. Se queda debajo del encabezado fijo gracias
 * al scroll-margin-top del elemento (ver .llevar-a-la-vista).
 */
export function llevarALaVista(elemento) {
  if (!elemento) return;
  const { top } = elemento.getBoundingClientRect();
  const margen = Number.parseFloat(getComputedStyle(elemento).scrollMarginTop) || 0;
  // Se ve si su comienzo está en la pantalla (un aviso fijo abajo, como en el celular, ya se ve).
  const visible = top >= margen - 1 && top <= window.innerHeight * 0.75;
  if (!visible) elemento.scrollIntoView?.({ behavior: movimiento(), block: "start" });
}
