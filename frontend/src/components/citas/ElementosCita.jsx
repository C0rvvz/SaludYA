import { CLASE_ESTADO } from "../../utils/citas";
import { formatearDiaChip, formatearMesCorto } from "../../utils/formato";

/** Piezas pequeñas que comparten la lista y el detalle de "Mis citas". */

export function EstadoBadge({ cita }) {
  return <span className={`badge ${CLASE_ESTADO[cita.estado_visible]}`}>{cita.estado_texto}</span>;
}

export function BloqueFecha({ fecha }) {
  const { dia, numero } = formatearDiaChip(fecha);
  return (
    <span className="bloque-fecha" aria-hidden="true">
      <span>{dia}</span>
      <strong>{numero}</strong>
      <span>{formatearMesCorto(fecha)}</span>
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
