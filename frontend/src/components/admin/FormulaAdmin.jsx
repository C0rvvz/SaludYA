import { useState } from "react";
import { formatearFechaHora, formatearFechaLarga } from "../../utils/formato";
import { BotonIcono, IconoQuitar } from "./IconosAdmin";

/**
 * Fórmula médica de una cita atendida, en el detalle del personal
 * (coordinador médico o administrador: acciones.formula).
 *
 * Sin fórmula: "Registrar fórmula". Con fórmula: lo que se registró y
 * "Corregir fórmula". El formulario pide lo que escribió el médico (el
 * diagnóstico y su nota), los medicamentos (nombre, dosis, cada cuánto,
 * por cuánto tiempo y cuántos) y las recomendaciones, una por línea.
 * La primera vez se le avisa al paciente que ya puede verla en Mis citas.
 *
 * `onGuardar(datos)` devuelve true si se guardó.
 */

const MEDICAMENTO_VACIO = { nombre: "", dosis: "", indicacion: "", duracion: "", cantidad: "" };

// [campo, etiqueta, ejemplo, largo máximo, a todo el ancho]
const CAMPOS_MEDICAMENTO = [
  ["nombre", "Medicamento", "Ej. Amoxicilina", 120, true],
  ["indicacion", "Cada cuánto", "Ej. 1 cápsula cada 8 horas", 200, true],
  ["dosis", "Dosis", "Ej. 500 mg", 60],
  ["duracion", "Por cuánto tiempo", "Ej. 7 días", 80],
  ["cantidad", "Cantidad", "Ej. 21 cápsulas", 60],
];

function datosIniciales(formula) {
  return {
    diagnostico: formula?.diagnostico ?? "",
    nota: formula?.nota ?? "",
    medicamentos: formula?.medicamentos.length ? formula.medicamentos : [MEDICAMENTO_VACIO],
    recomendaciones: formula?.recomendaciones.join("\n") ?? "",
    cubierta_por_eps: formula?.cubierta_por_eps ?? true,
  };
}

function Resumen({ formula }) {
  return (
    <div className="formula-admin__resumen">
      <p>
        <strong>{formula.diagnostico}</strong>
      </p>
      {formula.nota && <p className="texto-suave">“{formula.nota}”</p>}
      {formula.medicamentos.length > 0 && (
        <ul className="formula-admin__lista">
          {formula.medicamentos.map((m, i) => (
            <li key={i}>
              <strong>
                {m.nombre} {m.dosis}
              </strong>{" "}
              · {[m.indicacion, m.duracion, m.cantidad].filter(Boolean).join(" · ")}
            </li>
          ))}
        </ul>
      )}
      {formula.recomendaciones.length > 0 && (
        <ul className="formula-admin__lista">
          {formula.recomendaciones.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <p className="texto-suave">
        Código {formula.codigo} · vale hasta el {formatearFechaLarga(formula.vence_en).toLowerCase()} ·{" "}
        {formula.cubierta_por_eps ? "cubierta por la EPS" : "no la cubre la EPS"}
        <br />
        Registrada por {formula.registrada_por} el {formatearFechaHora(formula.registrada_en)}
      </p>
    </div>
  );
}

export default function FormulaAdmin({ formula, ocupado, onGuardar }) {
  const [datos, setDatos] = useState(null); // null: no se está editando

  const cambiarMedicamento = (i, campo, valor) =>
    setDatos({ ...datos, medicamentos: datos.medicamentos.map((m, j) => (j === i ? { ...m, [campo]: valor } : m)) });

  async function guardar(evento) {
    evento.preventDefault();
    const ok = await onGuardar({
      diagnostico: datos.diagnostico.trim(),
      nota: datos.nota.trim() || null,
      // Las filas sin nombre no cuentan (p. ej. la vacía del final).
      medicamentos: datos.medicamentos.filter((m) => m.nombre.trim()),
      recomendaciones: datos.recomendaciones
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean),
      cubierta_por_eps: datos.cubierta_por_eps,
    });
    if (ok) setDatos(null);
  }

  return (
    <section className="card" aria-labelledby="titulo-formula-admin">
      <h2 className="admin-card__titulo" id="titulo-formula-admin">
        Fórmula médica
      </h2>

      {datos === null ? (
        <>
          {formula ? (
            <Resumen formula={formula} />
          ) : (
            <p className="texto-suave">
              Todavía no hay fórmula de esta cita. Al registrarla, el paciente la ve en Mis citas con las farmacias donde
              reclamar sus medicamentos.
            </p>
          )}
          <div className="acciones-admin">
            <button type="button" className="btn btn--outline" onClick={() => setDatos(datosIniciales(formula))}>
              {formula ? "Corregir fórmula" : "Registrar fórmula"}
            </button>
          </div>
        </>
      ) : (
        <form className="formula-admin" onSubmit={guardar}>
          <div className="field">
            <label htmlFor="formula_diagnostico">Diagnóstico</label>
            <input
              id="formula_diagnostico"
              required
              maxLength={300}
              placeholder="Ej. Faringitis aguda"
              value={datos.diagnostico}
              onChange={(e) => setDatos({ ...datos, diagnostico: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="formula_nota">Lo que escribió el médico <span className="opcional">(opcional)</span></label>
            <textarea
              id="formula_nota"
              rows={3}
              maxLength={2000}
              value={datos.nota}
              onChange={(e) => setDatos({ ...datos, nota: e.target.value })}
            />
          </div>

          <fieldset className="formula-admin__medicamentos">
            <legend>Medicamentos</legend>
            {datos.medicamentos.map((m, i) => (
              <div key={i} className="formula-admin__medicamento">
                <div className="formula-admin__medicamento-cabeza">
                  <span>Medicamento {i + 1}</span>
                  <BotonIcono
                    nombre={`Quitar el medicamento ${i + 1}`}
                    peligro
                    onClick={() => setDatos({ ...datos, medicamentos: datos.medicamentos.filter((_, j) => j !== i) })}
                  >
                    <IconoQuitar />
                  </BotonIcono>
                </div>
                <div className="formula-admin__campos">
                  {CAMPOS_MEDICAMENTO.map(([campo, etiqueta, ejemplo, largo, ancho]) => (
                    <div className={`field ${ancho ? "formula-admin__campo--ancho" : ""}`} key={campo}>
                      <label htmlFor={`medicamento_${i}_${campo}`}>{etiqueta}</label>
                      <input
                        id={`medicamento_${i}_${campo}`}
                        maxLength={largo}
                        placeholder={ejemplo}
                        // Con nombre, hay que decir cómo tomarlo.
                        required={campo === "indicacion" && Boolean(m.nombre.trim())}
                        value={m[campo]}
                        onChange={(e) => cambiarMedicamento(i, campo, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn--outline btn--compacto"
              disabled={datos.medicamentos.length >= 15}
              onClick={() => setDatos({ ...datos, medicamentos: [...datos.medicamentos, MEDICAMENTO_VACIO] })}
            >
              Agregar medicamento
            </button>
          </fieldset>

          <div className="field">
            <label htmlFor="formula_recomendaciones">Recomendaciones (una por línea)</label>
            <textarea
              id="formula_recomendaciones"
              rows={3}
              placeholder={"Ej. Tome mucha agua.\nDescanse."}
              value={datos.recomendaciones}
              onChange={(e) => setDatos({ ...datos, recomendaciones: e.target.value })}
            />
          </div>
          <label className="opcion-admin opcion-admin--casilla">
            <input
              type="checkbox"
              checked={datos.cubierta_por_eps}
              onChange={(e) => setDatos({ ...datos, cubierta_por_eps: e.target.checked })}
            />
            <span className="opcion-admin__titulo">Medicamentos cubiertos por la EPS (gratis en farmacias aliadas)</span>
          </label>

          <div className="acciones-admin">
            <button type="submit" className="btn btn--primary" disabled={ocupado}>
              Guardar fórmula
            </button>
            <button type="button" className="btn btn--outline btn--texto-peligro" onClick={() => setDatos(null)}>
              No, volver
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
