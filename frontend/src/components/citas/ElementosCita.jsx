import { CLASE_ESTADO, ESTADO_CORTO } from "../../utils/citas";
import { formatearMesCorto } from "../../utils/formato";

/** Piezas pequeñas que comparten la lista y el detalle de "Mis citas" (y el personal). */

/**
 * `corto`: "Por confirmar" en vez de "Pendiente de confirmar asistencia" (Mis citas).
 * `textos`: otro juego de nombres cortos (p. ej. ESTADO_PERSONAL en las tablas del personal).
 */
export function EstadoBadge({ cita, corto = false, textos }) {
  const cortos = textos ?? (corto ? ESTADO_CORTO : null);
  const texto = cortos?.[cita.estado_visible] ?? cita.estado_texto;
  return <span className={`badge ${CLASE_ESTADO[cita.estado_visible]}`}>{texto}</span>;
}

/** Bloque "OCT / 22" de la lista de citas; azul oscuro si es la cita abierta. */
export function BloqueFecha({ fecha, elegida = false }) {
  return (
    <span className={`bloque-fecha-cita ${elegida ? "is-elegida" : ""}`} aria-hidden="true">
      <span className="bloque-fecha-cita__mes">{formatearMesCorto(fecha)}</span>
      <span className="bloque-fecha-cita__dia">{String(new Date(`${fecha}T00:00:00`).getDate()).padStart(2, "0")}</span>
    </span>
  );
}

export function Fila({ etiqueta, children }) {
  return (
    <div className="summary-row">
      <span className="summary-row__label">{etiqueta}</span>
      <span className="summary-row__value">{children}</span>
    </div>
  );
}
