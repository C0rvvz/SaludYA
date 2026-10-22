const NIVELES = {
  bajo: { texto: "Bajo", color: "var(--color-success)" },
  medio: { texto: "Medio", color: "var(--color-warning-ink)" },
  alto: { texto: "Alto", color: "var(--color-error)" },
};

/**
 * Nivel estimado de inasistencia (HU-34): anillo con el porcentaje y el
 * nivel en su color. Es una recomendación de acompañamiento, nunca un
 * motivo para negar la atención.
 */
export default function IndicadorRiesgo({ riesgo, grande = false }) {
  if (!riesgo) return <span className="texto-suave">—</span>;
  const nivel = NIVELES[riesgo.nivel];

  return (
    <span className={`indicador-riesgo ${grande ? "indicador-riesgo--grande" : ""}`}>
      <span
        className="indicador-riesgo__medidor"
        style={{ background: `conic-gradient(${nivel.color} ${riesgo.porcentaje}%, var(--color-bg) 0)` }}
        role="img"
        aria-label={`${riesgo.porcentaje}% estimado de inasistencia`}
      >
        <span>{riesgo.porcentaje}%</span>
      </span>
      <span className="indicador-riesgo__nivel" style={{ color: nivel.color }}>
        {grande ? `Riesgo ${nivel.texto.toLowerCase()}` : nivel.texto}
      </span>
    </span>
  );
}
