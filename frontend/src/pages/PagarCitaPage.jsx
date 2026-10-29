import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import PasosAgendar from "../components/agendar/PasosAgendar";
import FormularioPse from "../components/pagos/FormularioPse";
import FormularioTarjeta from "../components/pagos/FormularioTarjeta";
import { resumenDelPago } from "../api/pagos";
import { subirAlInicio } from "../utils/desplazamiento";
import { formatearDiaMes, formatearPesos } from "../utils/formato";
import { PASOS_PAGO } from "../utils/pagos";
import "../styles/pagos.css";

const METODOS = [
  { valor: "pse", titulo: "PSE", ayuda: "Desde su cuenta de banco" },
  { valor: "tarjeta", titulo: "Tarjeta", ayuda: "Débito o crédito" },
];

/**
 * Pagar en línea una cita ya atendida (el copago o la consulta particular),
 * para no hacer fila en la sede. Pasos: Revisar (qué se paga y cómo) ›
 * Pagar (PSE o tarjeta) › Listo (ResultadoPagoPage).
 *
 * Es una simulación del proceso de Wompi: no se cobra dinero real.
 * "Intentar de nuevo" vuelve aquí con el mismo medio (state.metodo).
 */
export default function PagarCitaPage() {
  const { citaId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");
  const [metodo, setMetodo] = useState(state?.metodo ?? null);
  const [paso, setPaso] = useState(state?.metodo ? 2 : 1);
  const [faltaMetodo, setFaltaMetodo] = useState(false);

  useEffect(() => {
    resumenDelPago(citaId)
      .then(setResumen)
      .catch((err) => setError(err.message));
  }, [citaId]);

  function irAPaso(numero) {
    setPaso(numero);
    subirAlInicio();
  }

  function continuar() {
    if (!metodo) {
      setFaltaMetodo(true);
      return;
    }
    irAPaso(2);
  }

  let contenido;
  if (error) {
    contenido = (
      <div className="pago__formulario">
        <div className="alert alert--error" role="alert">
          {error}
        </div>
        <Link to="/mis-citas" className="btn btn--outline">
          Volver a mis citas
        </Link>
      </div>
    );
  } else if (!resumen) {
    contenido = <p>Cargando su pago…</p>;
  } else if (resumen.pago) {
    // Ya la pagó: se muestra el comprobante.
    return <Navigate to={`/pagar/resultado/${resumen.pago.referencia}`} replace />;
  } else if (!resumen.pendiente) {
    contenido = (
      <div className="pago__formulario">
        <div className="alert alert--info">
          Esta cita no tiene pagos pendientes. Se paga después de que lo atiendan.
        </div>
        <Link to="/mis-citas" className="btn btn--outline">
          Volver a mis citas
        </Link>
      </div>
    );
  } else if (paso === 2 && metodo === "pse") {
    contenido = (
      <FormularioPse
        resumen={resumen}
        onVolver={() => irAPaso(1)}
        onIniciado={(pago) => navigate(`/pagar/banco/${pago.referencia}`)}
      />
    );
  } else if (paso === 2 && metodo === "tarjeta") {
    contenido = (
      <FormularioTarjeta
        resumen={resumen}
        onVolver={() => irAPaso(1)}
        onPagado={(pago) => navigate(`/pagar/resultado/${pago.referencia}`, { replace: true })}
      />
    );
  } else {
    contenido = (
      <div className="pago__formulario">
        <div className="pago__encabezado">
          <h1>Pagar su consulta</h1>
          <p className="pago__lead">Pague desde aquí y no tiene que hacer fila en la sede.</p>
        </div>

        <section className="card pago__tarjeta" aria-label="Lo que va a pagar">
          <dl className="pago__resumen">
            <div>
              <dt>Cita</dt>
              <dd>
                {resumen.especialidad} · {formatearDiaMes(resumen.fecha)}
              </dd>
            </div>
            <div>
              <dt>Médico</dt>
              <dd>{resumen.especialista}</dd>
            </div>
            <div>
              <dt>{resumen.concepto}</dt>
              <dd>{formatearPesos(resumen.valor)}</dd>
            </div>
          </dl>
          <div className="pago__total">
            <span>Total a pagar</span>
            <strong>{formatearPesos(resumen.valor)}</strong>
          </div>
        </section>

        <fieldset className="pago__opciones" aria-describedby={faltaMetodo ? "error-metodo" : undefined}>
          <legend className="obligatorio">¿Cómo quiere pagar?</legend>
          <div className="pago__opciones-lista">
            {METODOS.map((m) => (
              <label key={m.valor} className="opcion-pago opcion-pago--grande">
                <input
                  type="radio"
                  name="metodo"
                  value={m.valor}
                  checked={metodo === m.valor}
                  onChange={() => {
                    setMetodo(m.valor);
                    setFaltaMetodo(false);
                  }}
                />
                <span>
                  <span className="opcion-pago__titulo">{m.titulo}</span>
                  <span className="opcion-pago__ayuda">{m.ayuda}</span>
                </span>
              </label>
            ))}
          </div>
          {faltaMetodo && (
            <span className="field__error" id="error-metodo" role="alert">
              Elija cómo quiere pagar.
            </span>
          )}
        </fieldset>

        <p className="pago__seguro">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <span>
            Pago de prueba: simula el proceso de Wompi y no cobra dinero real. SaludYA no guarda los datos de su
            tarjeta.
          </span>
        </p>

        <div className="pago__acciones">
          <Link to="/mis-citas" className="btn btn--outline">
            Volver
          </Link>
          <button type="button" className="btn btn--primary" onClick={continuar}>
            Continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <EncabezadoPaciente />
      <div className="section pago">
        {resumen?.pendiente && (
          <PasosAgendar
            actual={paso}
            pasos={PASOS_PAGO}
            etiqueta="Pasos para pagar"
            onAtras={paso === 2 ? () => irAPaso(1) : undefined}
          />
        )}
        {contenido}
      </div>
    </div>
  );
}
