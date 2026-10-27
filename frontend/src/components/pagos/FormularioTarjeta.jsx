import { useState } from "react";
import { pagarCita, tokenizarTarjeta } from "../../api/pagos";
import { formatearPesos } from "../../utils/formato";
import { TARJETAS_DE_PRUEBA } from "../../utils/pagos";

const CUOTAS = Array.from({ length: 36 }, (_, i) => i + 1);
const MESES = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

// "4242424242424242" -> "4242 4242 4242 4242"
const enGrupos = (texto) =>
  texto
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

/**
 * Pago con tarjeta: número, vencimiento, código de atrás, nombre y cuotas.
 * Primero la tarjeta se cambia por un token (como en Wompi) y con ese token
 * se paga; los datos de la tarjeta no se guardan. `onPagado(pago)` al terminar,
 * se apruebe o no.
 */
export default function FormularioTarjeta({ resumen, onPagado, onVolver }) {
  const anioActual = new Date().getFullYear();
  const [tarjeta, setTarjeta] = useState({ numero: "", mes: "", anio: "", cvc: "", titular: "", cuotas: 1 });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState("");
  const [pagando, setPagando] = useState(false);

  const cambiar = (campo) => (e) => {
    const valor = campo === "numero" ? enGrupos(e.target.value) : e.target.value;
    setTarjeta((t) => ({ ...t, [campo]: campo === "cvc" ? valor.replace(/\D/g, "").slice(0, 4) : valor }));
    setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
  };

  function revisar() {
    const numero = tarjeta.numero.replace(/\D/g, "");
    const faltan = {};
    if (!numero) faltan.numero = "Escriba el número de la tarjeta.";
    else if (!TARJETAS_DE_PRUEBA[numero])
      faltan.numero = "Este es un pago de prueba: use una de las tarjetas de prueba que aparecen arriba.";
    if (!tarjeta.mes || !tarjeta.anio) faltan.vence = "Elija el mes y el año en que vence.";
    if (!/^\d{3,4}$/.test(tarjeta.cvc)) faltan.cvc = "Son los 3 números de atrás de la tarjeta.";
    if (tarjeta.titular.trim().length < 3) faltan.titular = "Escriba el nombre como aparece en la tarjeta.";
    setErrores(faltan);
    return Object.keys(faltan).length === 0;
  }

  async function pagar(e) {
    e.preventDefault();
    setError("");
    if (!revisar()) return;
    setPagando(true);
    try {
      const { token } = await tokenizarTarjeta(tarjeta);
      onPagado(await pagarCita(resumen.cita_id, { metodo: "tarjeta", token, cuotas: Number(tarjeta.cuotas) }));
    } catch (err) {
      setError(err.message);
      setPagando(false);
    }
  }

  const campoError = (campo) =>
    errores[campo] && (
      <span className="field__error" id={`error-${campo}`}>
        {errores[campo]}
      </span>
    );

  return (
    <form className="pago__formulario" onSubmit={pagar} noValidate>
      <div className="pago__encabezado">
        <h1>Pago con tarjeta</h1>
        <p className="pago__lead">Escriba los datos tal como aparecen en la tarjeta.</p>
      </div>

      <div className="alert alert--info pago__prueba">
        <strong>Pago de prueba: no se cobra dinero real.</strong> Use la tarjeta <strong>4242 4242 4242 4242</strong>{" "}
        (se aprueba) o la <strong>4111 1111 1111 1111</strong> (se rechaza), con cualquier fecha futura y cualquier
        código de 3 números.
      </div>

      <section className="card pago__tarjeta">
        <div className="field">
          <label htmlFor="tarjeta-numero" className="obligatorio">
            Número de la tarjeta
          </label>
          <input
            id="tarjeta-numero"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0000 0000 0000 0000"
            value={tarjeta.numero}
            onChange={cambiar("numero")}
            className={errores.numero ? "has-error" : ""}
            aria-invalid={Boolean(errores.numero)}
            aria-describedby={errores.numero ? "error-numero" : undefined}
          />
          {campoError("numero")}
        </div>

        <div className="pago__dos-columnas">
          <fieldset className="field pago__vence">
            <legend className="obligatorio">Vence</legend>
            <div className="pago__vence-campos">
              <select
                aria-label="Mes en que vence"
                value={tarjeta.mes}
                onChange={cambiar("mes")}
                className={errores.vence ? "has-error" : ""}
              >
                <option value="">Mes</option>
                {MESES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                aria-label="Año en que vence"
                value={tarjeta.anio}
                onChange={cambiar("anio")}
                className={errores.vence ? "has-error" : ""}
              >
                <option value="">Año</option>
                {Array.from({ length: 12 }, (_, i) => anioActual + i).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            {campoError("vence")}
          </fieldset>

          <div className="field">
            <label htmlFor="tarjeta-cvc" className="obligatorio">
              Código de atrás (CVC)
            </label>
            <input
              id="tarjeta-cvc"
              inputMode="numeric"
              autoComplete="off"
              placeholder="123"
              value={tarjeta.cvc}
              onChange={cambiar("cvc")}
              className={errores.cvc ? "has-error" : ""}
              aria-invalid={Boolean(errores.cvc)}
              aria-describedby={errores.cvc ? "error-cvc" : undefined}
            />
            {campoError("cvc")}
          </div>
        </div>

        <div className="field">
          <label htmlFor="tarjeta-titular" className="obligatorio">
            Nombre como aparece en la tarjeta
          </label>
          <input
            id="tarjeta-titular"
            autoComplete="off"
            value={tarjeta.titular}
            onChange={cambiar("titular")}
            className={errores.titular ? "has-error" : ""}
            aria-invalid={Boolean(errores.titular)}
            aria-describedby={errores.titular ? "error-titular" : undefined}
          />
          {campoError("titular")}
        </div>

        <div className="field">
          <label htmlFor="tarjeta-cuotas">Número de cuotas</label>
          <select id="tarjeta-cuotas" value={tarjeta.cuotas} onChange={cambiar("cuotas")}>
            {CUOTAS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 cuota" : `${n} cuotas`}
              </option>
            ))}
          </select>
          <span className="field__hint">Con tarjeta débito siempre es 1 cuota.</span>
        </div>
      </section>

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      <div className="pago__acciones">
        <button type="button" className="btn btn--outline" onClick={onVolver} disabled={pagando}>
          Volver
        </button>
        <button type="submit" className="btn btn--primary" disabled={pagando}>
          {pagando ? "Pagando…" : `Pagar ${formatearPesos(resumen.valor)}`}
        </button>
      </div>
    </form>
  );
}
