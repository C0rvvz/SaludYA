import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { obtenerFormula } from "../../api/citas";
import { useAuth } from "../../context/AuthContext";
import { enlaceAFarmacia } from "../../utils/citas";
import { formatearDiaMes, formatearHora } from "../../utils/formato";
import { IconoDescargar, IconoPastilla, IconoUbicacion } from "../Iconos";

/**
 * Fórmula médica de una cita atendida, en su detalle de "Mis citas":
 *
 * - Lo que escribió su médico: el diagnóstico y su nota.
 * - Sus medicamentos (nombre, dosis, cada cuánto, por cuánto tiempo y
 *   cuántos) y "Descargar fórmula" (la imprime o la guarda en PDF).
 * - Las recomendaciones.
 * - Dónde reclamar: las farmacias cercanas a la sede donde lo atendieron.
 *   En las aliadas se los entregan gratis mostrando el QR de su código;
 *   las demás cobran. Todas con "Cómo llegar".
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

function Farmacia({ farmacia: f, formula, conCodigo, vigente, onVerCodigo }) {
  const gratis = formula.cubierta_por_eps;
  const etiqueta = f.aliada ? (gratis ? "Aliada · gratis" : "Aliada") : gratis ? "No aliada · con costo" : "No aliada";
  const cuantos = formula.medicamentos.length;
  return (
    <li className={`farmacia ${conCodigo ? "farmacia--con-codigo" : ""}`}>
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

      {conCodigo && (
        <div className="farmacia__codigo">
          <img src={formula.qr} width="176" height="176" alt={`Código QR de su fórmula ${formula.codigo}`} />
          <div>
            <p className="farmacia__codigo-titulo">Muestre este código en la farmacia</p>
            <p>
              Le entregan {cuantos === 1 ? "su medicamento" : `sus ${cuantos} medicamentos`}
              {gratis && " sin costo"}. Vale hasta el {formatearDiaMes(formula.vence_en)}.
            </p>
            <p className="farmacia__numero">{formula.codigo}</p>
          </div>
        </div>
      )}

      <div className="farmacia__acciones">
        {f.aliada && vigente && !conCodigo && (
          <button
            type="button"
            className="btn btn--outline"
            aria-label={`Ver mi código para ${f.nombre}`}
            onClick={onVerCodigo}
          >
            Ver mi código
          </button>
        )}
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

/** La fórmula para imprimir o guardar en PDF ("Descargar fórmula"): solo existe mientras se imprime. */
function FormulaImpresa({ formula, paciente }) {
  return createPortal(
    <div className="formula-impresa">
      <p className="formula-impresa__marca">SaludYA · Fórmula médica</p>
      <h1>{formula.especialidad}</h1>
      <p>
        {formula.especialista} · {formatearDiaMes(formula.fecha)}, {formatearHora(formula.hora)} · {formula.sede}
      </p>
      {paciente && <p>Paciente: {paciente.nombre}</p>}
      <h2>Diagnóstico</h2>
      <p>{formula.diagnostico}</p>
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
        <img src={formula.qr} width="140" height="140" alt="" />
        <p>
          Código <strong>{formula.codigo}</strong>
          <br />
          Vale hasta el {formatearDiaMes(formula.vence_en)}
        </p>
      </div>
    </div>,
    document.body
  );
}

export default function FormulaCita({ citaId }) {
  const { paciente } = useAuth();
  const [formula, setFormula] = useState(null);
  const [error, setError] = useState("");
  const [conCodigo, setConCodigo] = useState(null); // la farmacia aliada que muestra el QR
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    obtenerFormula(citaId)
      .then((datos) => {
        setFormula(datos);
        // Abierto de una vez el código en la aliada más cercana.
        setConCodigo(datos.farmacias.find((f) => f.aliada)?.id ?? null);
      })
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
                ? "En las farmacias aliadas los recibe gratis mostrando su código."
                : "Su EPS no cubre estos medicamentos: tienen costo en cualquier farmacia."}
            </p>
          </div>
          {!vigente && (
            <div className="alert alert--info">
              Esta fórmula venció el {formatearDiaMes(formula.vence_en)}. Si todavía necesita los medicamentos, pida una
              cita para que se la renueven.
            </div>
          )}
          <ul className="farmacias">
            {formula.farmacias.map((f) => (
              <Farmacia
                key={f.id}
                farmacia={f}
                formula={formula}
                vigente={vigente}
                conCodigo={vigente && f.id === conCodigo}
                onVerCodigo={() => setConCodigo(f.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {imprimiendo && <FormulaImpresa formula={formula} paciente={paciente} />}
    </>
  );
}
