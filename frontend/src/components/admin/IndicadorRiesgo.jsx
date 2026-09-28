const NIVELES = {
  bajo: { texto: "Riesgo bajo", clase: "badge--success", color: "var(--color-success)" },
  medio: { texto: "Riesgo medio", clase: "badge--warning", color: "var(--color-warning-ink)" },
  alto: { texto: "Riesgo alto", clase: "badge--error", color: "var(--color-error)" },
};

/**
 * Nivel estimado de inasistencia (HU-34): medidor circular + nivel.
 * Es una recomendación de acompañamiento, nunca un motivo para negar la atención.
 */
export default function IndicadorRiesgo({ riesgo, grande = false }) {
  if (!riesgo) return <span className="texto-suave">—</span>;
  const nivel = NIVELES[riesgo.nivel];

  return (
    <span className={`indicador-riesgo ${grande ? "indicador-riesgo--grande" : ""}`}>
      <span
        className="indicador-riesgo__medidor"
        style={{
          background: `conic-gradient(${nivel.color} ${riesgo.porcentaje}%, var(--color-line) 0)`,
        }}
        role="img"
        aria-label={`${riesgo.porcentaje}% estimado de inasistencia`}
      >
        <span>{riesgo.porcentaje}%</span>
      </span>
      <span className={`badge ${nivel.clase}`}>{nivel.texto}</span>
    </span>
  );
}
