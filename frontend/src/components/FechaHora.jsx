import { formatearSoloFecha, formatearSoloHora } from "../utils/formato";

/** Fecha y hora de un evento en una celda: la fecha en una línea, sin partirse, y la hora debajo. */
export default function FechaHora({ valor }) {
  if (!valor) return "—";
  return (
    <>
      <span className="celda-fecha">{formatearSoloFecha(valor)}</span>
      <span className="texto-suave">{formatearSoloHora(valor)}</span>
    </>
  );
}
