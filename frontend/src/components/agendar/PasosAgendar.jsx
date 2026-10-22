import { Chevron } from "../Iconos";

const PASOS = ["Especialista", "Fecha y hora", "Confirmar"];

/**
 * Los 3 pasos de "Agendar". Computador: círculos numerados unidos por una
 * línea (✓ verde en los completados). Celular: "Atrás", "Paso N de 3" y una
 * barra segmentada.
 */
export default function PasosAgendar({ actual, onAtras }) {
  return (
    <>
      <ol className="pasos-agendar" aria-label="Pasos para agendar">
        {PASOS.map((nombre, i) => {
          const numero = i + 1;
          const hecho = numero < actual || actual === 3;
          return (
            <li
              key={nombre}
              className={`pasos-agendar__paso ${hecho ? "is-hecho" : ""} ${numero === actual && !hecho ? "is-actual" : ""}`}
              aria-current={numero === actual ? "step" : undefined}
            >
              {i > 0 && <span className="pasos-agendar__linea" aria-hidden="true" />}
              <span className="pasos-agendar__numero" aria-hidden="true">
                {hecho ? "✓" : numero}
              </span>
              {nombre}
            </li>
          );
        })}
      </ol>

      <div className="pasos-agendar-movil">
        <div className="pasos-agendar-movil__fila">
          {onAtras ? (
            <button type="button" className="btn-volver" onClick={onAtras}>
              <span className="btn__circulo">
                <Chevron hacia="izquierda" />
              </span>
              Atrás
            </button>
          ) : (
            <span />
          )}
          <span className="pasos-agendar-movil__texto">Paso {actual} de 3</span>
        </div>
        <div className="pasos-agendar-movil__barra" aria-hidden="true">
          {PASOS.map((nombre, i) => (
            <span key={nombre} className={i < actual ? "is-hecho" : ""} />
          ))}
        </div>
      </div>
    </>
  );
}
