import { useEffect, useState } from "react";
import { obtenerReporte } from "../../api/admin";

// HU-68, criterio 2
const PERIODOS = [
  ["mes", "Este mes"],
  ["trimestre", "Este trimestre"],
  ["anio", "Este año"],
];

/**
 * HU-68: desplegable del periodo y reporte de ese periodo. Al cambiarlo
 * se vuelve a pedir todo, así que lo que se muestra corresponde solo al
 * periodo elegido (criterios 3 y 4).
 */
export function ConPeriodo({ children }) {
  const [periodo, setPeriodo] = useState("mes");
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true; // si cambian el periodo antes de que llegue la respuesta, se descarta
    obtenerReporte(periodo)
      .then((datos) => {
        if (!vigente) return;
        setReporte(datos);
        setError("");
      })
      .catch((err) => vigente && setError(err.message));
    return () => {
      vigente = false;
    };
  }, [periodo]);

  return (
    <>
      <div className="filters-card filtros-admin filtros-admin--periodo">
        <div className="field">
          <label htmlFor="periodo">Periodo</label>
          <select id="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <div className="alert alert--error">{error}</div>}
      {reporte && children(reporte)}
    </>
  );
}

export function Cifra({ valor, nombre, detalle }) {
  return (
    <div className="cifra">
      <strong className="cifra__valor">{valor}</strong>
      <span className="cifra__nombre">{nombre}</span>
      {detalle && <span className="texto-suave">{detalle}</span>}
    </div>
  );
}

/** Barras horizontales. Resalta la mayor (p. ej. el canal más usado, HU-49 criterio 2). */
export function Barras({ datos }) {
  const mayor = Math.max(0, ...datos.map((d) => d.valor));
  return (
    <ul className="barras">
      {datos.map((d) => (
        <li key={d.nombre} className={mayor > 0 && d.valor === mayor ? "is-mayor" : undefined}>
          <span className="barras__nombre">{d.nombre}</span>
          <span className="barras__pista">
            <span className="barras__relleno" style={{ width: `${mayor ? (100 * d.valor) / mayor : 0}%` }} />
          </span>
          <span className="barras__valor">{d.texto ?? d.valor}</span>
        </li>
      ))}
    </ul>
  );
}
