import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { obtenerFormula } from "../../api/citas";
import { useAuth } from "../../context/AuthContext";
import { enlaceAFarmacia } from "../../utils/citas";
import { formatearDiaMes, formatearHora } from "../../utils/formato";
import { IconoDescargar, IconoPastilla, IconoUbicacion } from "../Iconos";
import FormulaImpresa from "./FormulaImpresa";

/**
 * Fórmula médica de una cita atendida, en su detalle de "Mis citas":
 *
 * - Lo que escribió su médico: el diagnóstico y su nota.
 * - Sus medicamentos (nombre, dosis, cada cuánto, por cuánto tiempo y
 *   cuántos) y "Descargar fórmula" (la imprime o la guarda en PDF).
 * - Las recomendaciones.
 * - Dónde reclamar: arriba, el QR de su código, que sirve en cualquier
 *   farmacia aliada (allí se los entregan gratis); debajo, las farmacias,
 *   primero las cercanas a la sede donde lo atendieron, cada una con
 *   "Cómo llegar". Las que no son aliadas cobran.
 *
 * Se monta con key={cita.id}: al cambiar de cita empieza de cero.
 */

const km = (distancia) => `${distancia.toLocaleString("es-CO", { maximumFractionDigits: 1 })} km`;
const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

function Medicamento({ m }) {
  const cuanto = [m.duracion, m.cantidad].filter(Boolean).join(" · ");
  return (
    <li className="formula__medicamento">
      <span className="formula__pastilla">
        <IconoPastilla />
      </span>
      <div>
        <p className="formula__medicamento-nombre">
          {m.nombre} {m.dosis && <span>{m.dosis}</span>}
        </p>
        <p>{m.indicacion}</p>
        {cuanto && <p className="formula__medicamento-cuanto">{cuanto}</p>}
      </div>
    </li>
  );
}

/** El QR de la fórmula: el mismo código sirve en cualquier farmacia aliada. */
function CodigoFormula({ formula }) {
  const gratis = formula.cubierta_por_eps;
  const cuantos = formula.medicamentos.length;
  return (
    <div className="formula__codigo">
      <img src={formula.qr} width="176" height="176" alt={`Código QR de su fórmula ${formula.codigo}`} />
      <div>
        <p className="formula__codigo-titulo">
          {gratis ? "Muestre este código en cualquier farmacia aliada" : "Muestre este código en la farmacia"}
        </p>
        <p>
          {gratis ? "Le entregan" : "Con él le entregan"} {cuantos === 1 ? "su medicamento" : `sus ${cuantos} medicamentos`}
          {gratis && " sin costo"}. Válido hasta el {formatearDiaMes(formula.vence_en)}.
        </p>
        <p className="formula__numero">{formula.codigo}</p>
      </div>
    </div>
  );
}

function Farmacia({ farmacia: f, gratis }) {
  const etiqueta = f.aliada ? (gratis ? "Aliada · gratis" : "Aliada") : gratis ? "No aliada · con costo" : "No aliada";
  return (
    <li className="farmacia">
      <div className="farmacia__cabeza">
        <div>
          <p className="farmacia__nombre">{f.nombre}</p>
          <p className="farmacia__donde">
            {f.direccion ?? `${f.barrio}, ${f.ciudad}`} · {km(f.distancia_km)}
            {f.sede && ` de ${f.sede}`}
          </p>
        </div>
        <span className={`badge ${f.aliada ? "badge--success" : "badge--neutral"}`}>{etiqueta}</span>
      </div>

      <div className="farmacia__acciones">
        <a
          className="btn btn--outline"
          href={enlaceAFarmacia(f)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Cómo llegar a ${f.nombre}`}
        >
          <IconoUbicacion tamano={18} />
          Cómo llegar
        </a>
      </div>
    </li>
  );
}

export default function FormulaCita({ citaId }) {
  const { paciente } = useAuth();
  const [formula, setFormula] = useState(null);
  const [error, setError] = useState("");
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    obtenerFormula(citaId)
      .then(setFormula)
      .catch((err) => setError(err.message));
  }, [citaId]);

  if (error) return <div className="alert alert--error">{error}</div>;
  if (!formula) return <p className="texto-suave">Cargando su fórmula médica…</p>;

  const vigente = formula.vence_en >= hoy();
  const conMedicamentos = formula.medicamentos.length > 0;

  function descargar() {
    // Se dibuja la fórmula para imprimir antes de abrir el diálogo, y se quita al cerrarlo.
    flushSync(() => setImprimiendo(true));
    window.print();
    setImprimiendo(false);
  }

  const botonDescargar = (
    <button type="button" className="btn btn--outline formula__descargar" onClick={descargar}>
      <IconoDescargar tamano={18} />
      Descargar fórmula
    </button>
  );

  return (
    <>
      <section className="card formula" aria-labelledby="titulo-formula">
        <div>
          <h3 id="titulo-formula" className="formula__titulo">
            Su fórmula médica
          </h3>
          <p className="texto-suave">
            {formula.especialista} · {formatearDiaMes(formula.fecha)}, {formatearHora(formula.hora)}
          </p>
        </div>

        <div>
          <p className="formula__seccion">Lo que escribió su médico</p>
          <div className="formula__diagnostico">
            <p className="formula__etiqueta">Diagnóstico</p>
            <p className="formula__diagnostico-texto">{formula.diagnostico}</p>
            {formula.nota && <p className="formula__nota">“{formula.nota}”</p>}
          </div>
        </div>

        {conMedicamentos && (
          <div>
            <div className="formula__cabeza-seccion">
              <p className="formula__seccion">Sus medicamentos</p>
              {formula.cubierta_por_eps && <span className="badge badge--success">Cubiertos por su EPS</span>}
            </div>
            <ul className="formula__medicamentos">
              {formula.medicamentos.map((m, i) => (
                <Medicamento key={i} m={m} />
              ))}
            </ul>
            {botonDescargar}
          </div>
        )}

        {formula.recomendaciones.length > 0 && (
          <div>
            <p className="formula__seccion">Recomendaciones</p>
            <ul className="formula__recomendaciones">
              {formula.recomendaciones.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {!conMedicamentos && botonDescargar}

        {/* En el celular la lista de farmacias queda abajo: un atajo para llegar a ella. */}
        {conMedicamentos && (
          <button
            type="button"
            className="btn btn--primary formula__ir-farmacias"
            onClick={() => document.getElementById("donde-reclamar")?.scrollIntoView?.({ behavior: "smooth" })}
          >
            <IconoUbicacion tamano={18} />
            Dónde reclamarlos
          </button>
        )}
      </section>

      {conMedicamentos && (
        <section className="card formula" id="donde-reclamar" aria-labelledby="titulo-donde-reclamar">
          <div>
            <h3 id="titulo-donde-reclamar" className="formula__seccion">
              Dónde reclamar sus medicamentos
            </h3>
            <p className="texto-suave">
              {formula.cubierta_por_eps
                ? "Con este código los recibe gratis en cualquier farmacia aliada."
                : formula.particular
                  ? "Como paciente particular (sin EPS), sus medicamentos tienen costo en cualquier farmacia."
                  : "Su EPS no cubre estos medicamentos: tienen costo en cualquier farmacia."}
            </p>
          </div>
          {vigente ? (
            <CodigoFormula formula={formula} />
          ) : (
            <div className="alert alert--info">
              Esta fórmula venció el {formatearDiaMes(formula.vence_en)}. Si todavía necesita los medicamentos, pida una
              cita para que se la renueven.
            </div>
          )}
          <div>
            <p className="formula__seccion">Farmacias cercanas</p>
            <ul className="farmacias">
              {formula.farmacias.map((f) => (
                <Farmacia key={f.id} farmacia={f} gratis={formula.cubierta_por_eps} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {imprimiendo && <FormulaImpresa formula={formula} qr={formula.qr} paciente={paciente?.nombre} />}
    </>
  );
}
