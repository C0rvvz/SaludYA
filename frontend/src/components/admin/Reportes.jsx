import { useEffect, useState } from "react";
import { obtenerReporte } from "../../api/admin";
import { GRIS_GRAFICA } from "../../utils/graficas";

// HU-68, criterio 2
const PERIODOS = [
  ["mes", "Este mes"],
  ["trimestre", "Este trimestre"],
  ["anio", "Este año"],
];

/**
 * Encabezado de la página con el selector del periodo (HU-68) y el
 * reporte de ese periodo. Al cambiarlo se vuelve a pedir todo, así que lo
 * que se muestra corresponde solo al periodo elegido (criterios 3 y 4).
 */
export function ConPeriodo({ titulo, descripcion, children }) {
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
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">{titulo}</h1>
          <p className="admin-subtitulo">{descripcion}</p>
        </div>
        <div className="selector-periodo">
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

/**
 * Un indicador: el nombre arriba, el valor grande y un detalle debajo.
 * `tono`: "exito" | "aviso" | "peligro" colorea el valor.
 */
export function Cifra({ valor, nombre, detalle, tono }) {
  return (
    <div className={`cifra ${tono ? `cifra--${tono}` : ""}`}>
      <span className="cifra__nombre">{nombre}</span>
      <strong className="cifra__valor">{valor}</strong>
      {detalle && <span className="cifra__detalle">{detalle}</span>}
    </div>
  );
}

/** Título de una tarjeta, con un dato a la derecha (la fecha, el periodo, "Mayor: …"). */
export function CabezaTarjeta({ titulo, dato, id }) {
  return (
    <div className="admin-card__cabeza">
      <h2 className="admin-card__titulo" id={id}>
        {titulo}
      </h2>
      {dato && (typeof dato === "string" ? <span className="admin-card__dato">{dato}</span> : dato)}
    </div>
  );
}

/** Barras horizontales finas. Resalta la mayor (p. ej. el canal más usado, HU-49 criterio 2). */
export function Barras({ datos }) {
  const mayor = Math.max(0, ...datos.map((d) => d.valor));
  return (
    <ul className="barras">
      {datos.map((d) => (
        <li key={d.nombre} className={mayor > 0 && d.valor === mayor ? "is-mayor" : undefined}>
          <span className="barras__fila">
            <span className="barras__nombre">{d.nombre}</span>
            <span className="barras__valor">{d.texto ?? d.valor.toLocaleString("es-CO")}</span>
          </span>
          <span className="barras__pista" aria-hidden="true">
            <span className="barras__relleno" style={{ width: `${mayor ? (100 * d.valor) / mayor : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Los tramos de color de una dona o de una barra apilada: [{ nombre, valor, color }]. */
function gradiente(segmentos) {
  const total = segmentos.reduce((suma, s) => suma + s.valor, 0);
  if (!total) return GRIS_GRAFICA;
  let desde = 0;
  const tramos = segmentos.map((s) => {
    const hasta = desde + (100 * s.valor) / total;
    const tramo = `${s.color} ${desde}% ${hasta}%`;
    desde = hasta;
    return tramo;
  });
  return `conic-gradient(${tramos.join(", ")})`;
}

/** Leyenda de una gráfica: color, nombre y valor. */
function Leyenda({ segmentos, enLinea = false }) {
  return (
    <ul className={`leyenda ${enLinea ? "leyenda--linea" : ""}`}>
      {segmentos.map((s) => (
        <li key={s.nombre}>
          <span className="leyenda__color" style={{ background: s.color }} aria-hidden="true" />
          <span className="leyenda__nombre">{s.nombre}</span> <strong>{s.valor.toLocaleString("es-CO")}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Dona (anillo) con el valor principal en el centro y la leyenda al lado. */
export function Dona({ segmentos, valor, texto }) {
  const resumen = segmentos.map((s) => `${s.nombre}: ${s.valor}`).join(", ");
  return (
    <div className="dona">
      <div className="dona__anillo" style={{ background: gradiente(segmentos) }} role="img" aria-label={resumen}>
        <div className="dona__centro" aria-hidden="true">
          <span className="dona__valor">{valor}</span>
          <span className="dona__texto">{texto}</span>
        </div>
      </div>
      <Leyenda segmentos={segmentos} />
    </div>
  );
}

/** Barra apilada de 8 px con su leyenda en una línea. */
export function BarraApilada({ segmentos }) {
  return (
    <>
      <div className="barra-apilada" aria-hidden="true">
        {segmentos
          .filter((s) => s.valor > 0)
          .map((s) => (
            <span key={s.nombre} style={{ flex: s.valor, background: s.color }} />
          ))}
      </div>
      <Leyenda segmentos={segmentos} enLinea />
    </>
  );
}

/**
 * Columnas verticales (tendencia). La última, en azul oscuro.
 * Con muchas (p. ej. los 12 meses del año) se compactan: el nombre corto
 * (`corto`, "Sep") y el valor corto (`textoCorto`, "78%"); el nombre completo
 * queda para lectores de pantalla y al pasar el cursor.
 */
const MAX_COLUMNAS_AMPLIAS = 6;

export function Columnas({ datos }) {
  const mayor = Math.max(0, ...datos.map((d) => d.valor));
  const compactas = datos.length > MAX_COLUMNAS_AMPLIAS;
  return (
    <ul className={`columnas ${compactas ? "columnas--compactas" : ""}`}>
      {datos.map((d) => (
        <li key={d.nombre} title={compactas ? `${d.nombre}: ${d.texto ?? d.valor}` : undefined}>
          <span className="columnas__valor">{(compactas && d.textoCorto) || d.texto || d.valor}</span>
          <span
            className="columnas__barra"
            style={{ height: `${mayor ? Math.max(4, (110 * d.valor) / mayor) : 4}px` }}
            aria-hidden="true"
          />
          {compactas && d.corto ? (
            <span className="columnas__nombre">
              <span aria-hidden="true">{d.corto}</span>
              <span className="sr-only">{d.nombre}</span>
            </span>
          ) : (
            <span className="columnas__nombre">{d.nombre}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
