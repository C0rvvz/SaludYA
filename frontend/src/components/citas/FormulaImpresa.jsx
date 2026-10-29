import { createPortal } from "react-dom";
import { formatearDiaMes, formatearHora } from "../../utils/formato";
import "../../styles/mis-citas.css";

/**
 * La fórmula para imprimir o guardar en PDF ("Descargar fórmula"), en Mis citas
 * y en Personal › Historia clínica. Solo existe mientras se imprime: el resto de
 * la página se oculta al imprimir (ver .formula-impresa en mis-citas.css).
 * `qr`: el del código de la fórmula; `paciente`: su nombre.
 */
export default function FormulaImpresa({ formula, qr, paciente }) {
  return createPortal(
    <div className="formula-impresa">
      <p className="formula-impresa__marca">SaludYA · Fórmula médica</p>
      <h1>{formula.especialidad}</h1>
      <p>
        {formula.especialista} · {formatearDiaMes(formula.fecha)}, {formatearHora(formula.hora)} · {formula.sede}
      </p>
      {paciente && <p>Paciente: {paciente}</p>}
      <h2>Diagnóstico</h2>
      <p>
        {formula.diagnostico}
        {formula.cie10 && ` (CIE-10 ${formula.cie10})`}
      </p>
      {formula.nota && <p>“{formula.nota}”</p>}
      {formula.medicamentos.length > 0 && (
        <>
          <h2>Medicamentos</h2>
          <ul>
            {formula.medicamentos.map((m, i) => (
              <li key={i}>
                <strong>
                  {m.nombre} {m.dosis}
                </strong>{" "}
                — {[m.indicacion, m.duracion, m.cantidad].filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
        </>
      )}
      {formula.recomendaciones.length > 0 && (
        <>
          <h2>Recomendaciones</h2>
          <ul>
            {formula.recomendaciones.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      <div className="formula-impresa__codigo">
        <img src={qr} width="140" height="140" alt="" />
        <p>
          Código <strong>{formula.codigo}</strong>
          <br />
          Válido hasta el {formatearDiaMes(formula.vence_en)}
        </p>
      </div>
    </div>,
    document.body
  );
}
