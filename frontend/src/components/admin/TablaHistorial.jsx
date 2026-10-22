import { useState } from "react";
import { Link } from "react-router-dom";
import { EstadoBadge } from "../citas/ElementosCita";
import { formatearFecha, formatearHora } from "../../utils/formato";

const VISIBLES = 8;

/**
 * Historial de citas de un paciente para el personal (HU-35, HU-78): una
 * fila por cita con su hora, médico y sede, para que dos citas del mismo
 * día no se confundan. `actualId` marca la cita que se está viendo, que
 * sigue en la lista para que esta no cambie al pasar de una cita a otra.
 */
export default function TablaHistorial({ citas, actualId, vacio }) {
  const [todas, setTodas] = useState(false);

  if (citas.every((c) => c.id === actualId)) return <p className="texto-suave">{vacio}</p>;

  const visibles = todas ? citas : citas.slice(0, VISIBLES);
  return (
    <>
      <div className="tabla-contenedor">
        <table className="tabla tabla--compacta">
          <caption className="sr-only">Citas del paciente, de la más reciente a la más antigua</caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cita</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((h) => {
              const esActual = h.id === actualId;
              return (
                <tr key={h.id} className={esActual ? "is-actual" : undefined} aria-current={esActual || undefined}>
                  <td>
                    <span className="celda-fecha">{formatearFecha(h.fecha)}</span>
                    <span className="texto-suave">{formatearHora(h.hora)}</span>
                  </td>
                  <td>
                    {esActual ? (
                      <strong>{h.especialidad}</strong>
                    ) : (
                      <Link to={`/admin/citas/${h.id}`}>{h.especialidad}</Link>
                    )}
                    <span className="texto-suave">
                      {h.especialista} · {h.sede}
                    </span>
                    {esActual && <span className="etiqueta-actual">Esta cita</span>}
                  </td>
                  <td>
                    <EstadoBadge cita={h} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {citas.length > VISIBLES && (
        <button type="button" className="btn btn--link" onClick={() => setTodas(!todas)}>
          {todas ? "Ver menos" : `Ver las ${citas.length} citas`}
        </button>
      )}
    </>
  );
}
