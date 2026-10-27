import { useState } from "react";
import { CIE10_FRECUENTES } from "../../utils/historiaClinica";
import { BotonIcono, IconoQuitar } from "./IconosAdmin";

/**
 * Registrar o corregir la fórmula médica de una cita atendida, en
 * Personal › Historia clínica (Médico o Coordinación médica).
 *
 * Pide lo que escribió el médico (el diagnóstico con su código CIE-10 y su
 * nota), los medicamentos (nombre, dosis, cada cuánto, por cuánto tiempo y
 * cuántos) y las recomendaciones, una por línea. La primera vez se le avisa
 * al paciente que ya puede verla en Mis citas.
 *
 * `onGuardar(datos)` devuelve true si se guardó; `onCancelar` cierra el formulario.
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

function datosIniciales(formula, particular) {
  return {
    diagnostico: formula?.diagnostico ?? "",
    cie10: formula?.cie10 ?? "",
    nota: formula?.nota ?? "",
    // Sin "entregado": eso lo marca la farmacia, no quien corrige la fórmula.
    medicamentos: formula?.medicamentos.length
      ? formula.medicamentos.map(({ nombre, dosis, indicacion, duracion, cantidad }) => ({
          nombre,
          dosis,
          indicacion,
          duracion,
          cantidad,
        }))
      : [MEDICAMENTO_VACIO],
    recomendaciones: formula?.recomendaciones.join("\n") ?? "",
    cubierta_por_eps: !particular && (formula?.cubierta_por_eps ?? true),
  };
}

export default function FormulaAdmin({ formula, particular = false, ocupado, onGuardar, onCancelar }) {
  const [datos, setDatos] = useState(() => datosIniciales(formula, particular));

  const cambiarMedicamento = (i, campo, valor) =>
    setDatos({ ...datos, medicamentos: datos.medicamentos.map((m, j) => (j === i ? { ...m, [campo]: valor } : m)) });

  // Al elegir un código frecuente, si el diagnóstico está vacío se llena con su nombre.
  function cambiarCie10(valor) {
    const codigo = valor.toUpperCase();
    const frecuente = CIE10_FRECUENTES.find(([c]) => c === codigo);
    setDatos({ ...datos, cie10: codigo, diagnostico: datos.diagnostico || (frecuente ? frecuente[1] : "") });
  }

  async function guardar(evento) {
    evento.preventDefault();
    const ok = await onGuardar({
      diagnostico: datos.diagnostico.trim(),
      cie10: datos.cie10.trim(),
      nota: datos.nota.trim() || null,
      // Las filas sin nombre no cuentan (p. ej. la vacía del final).
      medicamentos: datos.medicamentos.filter((m) => m.nombre.trim()),
      recomendaciones: datos.recomendaciones
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean),
      cubierta_por_eps: datos.cubierta_por_eps,
    });
    if (ok) onCancelar();
  }

  return (
    <section className="card" aria-labelledby="titulo-formula-admin">
      <h2 className="admin-card__titulo" id="titulo-formula-admin">
        {formula ? "Corregir la fórmula" : "Registrar la fórmula"}
      </h2>
      <form className="formula-admin" onSubmit={guardar}>
        <div className="formula-admin__diagnostico">
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
            <label htmlFor="formula_cie10">Código CIE-10</label>
            <input
              id="formula_cie10"
              required
              maxLength={12}
              list="cie10-frecuentes"
              placeholder="Ej. J02.9"
              autoComplete="off"
              value={datos.cie10}
              onChange={(e) => cambiarCie10(e.target.value)}
            />
            <datalist id="cie10-frecuentes">
              {CIE10_FRECUENTES.map(([codigo, nombre]) => (
                <option key={codigo} value={codigo}>
                  {nombre}
                </option>
              ))}
            </datalist>
          </div>
        </div>
        <div className="field">
          <label htmlFor="formula_nota">
            Lo que escribió el médico <span className="opcional">(opcional)</span>
          </label>
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
        {particular ? (
          <p className="texto-suave">El paciente es particular (sin EPS): sus medicamentos tienen costo.</p>
        ) : (
          <label className="opcion-admin opcion-admin--casilla">
            <input
              type="checkbox"
              checked={datos.cubierta_por_eps}
              onChange={(e) => setDatos({ ...datos, cubierta_por_eps: e.target.checked })}
            />
            <span className="opcion-admin__titulo">Medicamentos cubiertos por la EPS (gratis en farmacias aliadas)</span>
          </label>
        )}

        <div className="acciones-admin">
          <button type="submit" className="btn btn--primary" disabled={ocupado}>
            Guardar fórmula
          </button>
          <button type="button" className="btn btn--outline btn--texto-peligro" onClick={onCancelar}>
            No, volver
          </button>
        </div>
      </form>
    </section>
  );
}
