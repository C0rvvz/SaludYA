import { useState } from "react";
import { pagarCita } from "../../api/pagos";
import { formatearPesos } from "../../utils/formato";

const TIPOS_DE_PERSONA = [
  { valor: "natural", titulo: "Persona natural", ayuda: "Usted mismo o un familiar" },
  { valor: "empresa", titulo: "Empresa", ayuda: "Paga una empresa" },
];

/**
 * Pago con PSE: el banco, el tipo de persona y el correo registrado en PSE.
 * `onIniciado(pago)`: el pago queda esperando la respuesta del banco.
 */
export default function FormularioPse({ resumen, onIniciado, onVolver }) {
  const [banco, setBanco] = useState("");
  const [tipoPersona, setTipoPersona] = useState("natural");
  const [correo, setCorreo] = useState(resumen.correo ?? "");
  const [errores, setErrores] = useState({});
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function irAlBanco(e) {
    e.preventDefault();
    setError("");
    const faltan = {};
    if (!banco) faltan.banco = "Elija su banco.";
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) faltan.correo = "Escriba el correo con el que entra a PSE.";
    setErrores(faltan);
    if (Object.keys(faltan).length > 0) return;
    setEnviando(true);
    try {
      onIniciado(
        await pagarCita(resumen.cita_id, { metodo: "pse", banco, tipo_persona: tipoPersona, correo: correo.trim() })
      );
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="pago__formulario" onSubmit={irAlBanco} noValidate>
      <div className="pago__encabezado">
        <h1>Pago con PSE</h1>
        <p className="pago__lead">Elija su banco. Lo llevamos a la página del banco y al terminar vuelve aquí solo.</p>
      </div>

      <section className="card pago__tarjeta">
        <div className="field">
          <label htmlFor="pse-banco" className="obligatorio">
            Su banco
          </label>
          <select
            id="pse-banco"
            value={banco}
            onChange={(e) => {
              setBanco(e.target.value);
              setErrores((actuales) => ({ ...actuales, banco: undefined }));
            }}
            className={errores.banco ? "has-error" : ""}
            aria-invalid={Boolean(errores.banco)}
            aria-describedby={errores.banco ? "error-banco" : undefined}
          >
            <option value="">Elija su banco</option>
            {resumen.bancos.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          {errores.banco && (
            <span className="field__error" id="error-banco">
              {errores.banco}
            </span>
          )}
        </div>

        <fieldset className="pago__opciones">
          <legend className="obligatorio">Tipo de persona</legend>
          <div className="pago__opciones-lista">
            {TIPOS_DE_PERSONA.map((t) => (
              <label key={t.valor} className="opcion-pago">
                <input
                  type="radio"
                  name="tipo_persona"
                  value={t.valor}
                  checked={tipoPersona === t.valor}
                  onChange={() => setTipoPersona(t.valor)}
                />
                <span>
                  <span className="opcion-pago__titulo">{t.titulo}</span>
                  <span className="opcion-pago__ayuda">{t.ayuda}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="pse-correo" className="obligatorio">
            Correo registrado en PSE
          </label>
          <input
            id="pse-correo"
            type="email"
            autoComplete="email"
            value={correo}
            onChange={(e) => {
              setCorreo(e.target.value);
              setErrores((actuales) => ({ ...actuales, correo: undefined }));
            }}
            className={errores.correo ? "has-error" : ""}
            aria-invalid={Boolean(errores.correo)}
            aria-describedby={errores.correo ? "error-correo" : undefined}
          />
          {errores.correo && (
            <span className="field__error" id="error-correo">
              {errores.correo}
            </span>
          )}
        </div>

        <div className="pago__total">
          <span>Total a pagar</span>
          <strong>{formatearPesos(resumen.valor)}</strong>
        </div>
      </section>

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      <div className="pago__acciones">
        <button type="button" className="btn btn--outline" onClick={onVolver} disabled={enviando}>
          Volver
        </button>
        <button type="submit" className="btn btn--primary" disabled={enviando}>
          {enviando ? "Llevándolo a su banco…" : "Ir a mi banco"}
        </button>
      </div>
    </form>
  );
}
