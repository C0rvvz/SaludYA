import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { obtenerPago, responderEnElBanco } from "../api/pagos";
import { formatearDiaMes, formatearPesos } from "../utils/formato";
import "../styles/pagos.css";

/**
 * La página "del banco" en un pago con PSE. Es de PRUEBA: en un pago real la
 * persona entraría aquí a su banco con su usuario y clave; en la simulación
 * solo elige si autoriza el pago o no, y vuelve sola al resultado.
 */
export default function BancoPsePage() {
  const { referencia } = useParams();
  const navigate = useNavigate();
  const [pago, setPago] = useState(null);
  const [error, setError] = useState("");
  const [respondiendo, setRespondiendo] = useState(null); // true: autoriza, false: cancela

  useEffect(() => {
    obtenerPago(referencia)
      .then(setPago)
      .catch((err) => setError(err.message));
  }, [referencia]);

  async function responder(autoriza) {
    setRespondiendo(autoriza);
    setError("");
    try {
      await responderEnElBanco(referencia, autoriza);
      navigate(`/pagar/resultado/${referencia}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setRespondiendo(null);
    }
  }

  // Ya respondió (p. ej. volvió atrás en el navegador): se muestra el resultado.
  if (pago && pago.estado !== "pendiente") return <Navigate to={`/pagar/resultado/${referencia}`} replace />;

  const banco = pago?.detalle.replace(/^PSE · /, "");

  return (
    <div className="banco-prueba">
      <p className="banco-prueba__aviso">Página de prueba del banco · Simulación de PSE, no se cobra dinero real</p>
      <main className="banco-prueba__caja">
        {!pago && !error && <p>Conectando con su banco…</p>}
        {pago && (
          <>
            <p className="banco-prueba__banco">{banco}</p>
            <h1>Autorizar un pago a SaludYA</h1>
            <dl className="banco-prueba__datos">
              <div>
                <dt>Valor</dt>
                <dd className="banco-prueba__valor">{formatearPesos(pago.valor)}</dd>
              </div>
              <div>
                <dt>Concepto</dt>
                <dd>
                  Cita de {pago.especialidad} del {formatearDiaMes(pago.fecha_cita)}
                </dd>
              </div>
              <div>
                <dt>Referencia</dt>
                <dd>{pago.referencia}</dd>
              </div>
            </dl>
            <p className="banco-prueba__nota">
              En un pago real, aquí entraría a su banco con su usuario y clave. En esta prueba no se pide ninguna clave.
            </p>
          </>
        )}
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}
        {pago && (
          <div className="pago__acciones">
            <button
              type="button"
              className="btn btn--peligro-outline"
              disabled={respondiendo !== null}
              onClick={() => responder(false)}
            >
              {respondiendo === false ? "Cancelando…" : "Cancelar el pago"}
            </button>
            <button
              type="button"
              className="btn btn--success"
              disabled={respondiendo !== null}
              onClick={() => responder(true)}
            >
              {respondiendo === true ? "Autorizando…" : "Autorizar el pago"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
