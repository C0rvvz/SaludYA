import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listarAuditoria } from "../../api/admin";
import { formatearFechaHora } from "../../utils/formato";

/**
 * Auditoría — HU-80 a HU-85: qué acción se hizo (HU-82), quién la hizo
 * (HU-81), sobre qué cita (HU-84), el estado antes y después (HU-83),
 * en orden cronológico (HU-80) y completo por cita (HU-85, al filtrar).
 */

const ACCIONES = {
  agendar: "Agendar",
  confirmar_asistencia: "Confirmar asistencia",
  registrar_llegada: "Registrar llegada",
  recordatorio: "Recordatorio",
  recordatorio_fallido: "Recordatorio fallido",
  contacto: "Llamada",
  observacion: "Observación",
  cancelar: "Cancelar",
  reprogramar: "Reprogramar",
  registrar_resultado: "Registrar atención",
  cerrar_cita: "Cierre automático",
};

const RESPONSABLES = [
  ["", "Todos"],
  ["paciente", "Pacientes"],
  ["personal", "Personal"],
  ["sistema", "Sistema"],
];

export default function AdminAuditoriaPage() {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [accion, setAccion] = useState("");
  const [responsable, setResponsable] = useState("");
  const [texto, setTexto] = useState("");

  useEffect(() => {
    listarAuditoria({ accion })
      .then(setRegistros)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [accion]);

  const visibles = useMemo(() => {
    const buscado = texto.trim().toLowerCase();
    return registros.filter(
      (r) =>
        (!responsable || r.actor_tipo === responsable) &&
        (!buscado ||
          [r.actor_nombre, r.paciente_nombre, r.numero_comprobante, r.descripcion]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(buscado)))
    );
  }, [registros, responsable, texto]);

  return (
    <>
      <h1 className="admin-titulo">Auditoría</h1>
      <p className="admin-subtitulo">
        Trazabilidad de las acciones de pacientes, personal y del sistema sobre las citas. Los registros no se
        pueden modificar ni borrar.
      </p>

      <div className="filters-card filtros-admin">
        <div className="field">
          <label htmlFor="texto">Buscar</label>
          <input
            id="texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Paciente, responsable o comprobante"
          />
        </div>
        <div className="field">
          <label htmlFor="accion">Acción</label>
          <select
            id="accion"
            value={accion}
            onChange={(e) => {
              setCargando(true);
              setAccion(e.target.value);
            }}
          >
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="responsable">Responsable</label>
          <select id="responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
            {RESPONSABLES.map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Usuario responsable</th>
              <th>Acción realizada</th>
              <th>Cita relacionada</th>
              <th>Estado anterior</th>
              <th>Estado nuevo</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.id}>
                <td>{formatearFechaHora(r.fecha)}</td>
                <td>{r.actor_nombre}</td>
                <td>
                  {r.descripcion}
                  {r.detalle && <span className="texto-suave">“{r.detalle}”</span>}
                </td>
                <td>
                  {r.cita_id ? (
                    <Link to={`/admin/citas/${r.cita_id}`}>{r.numero_comprobante ?? "Ver cita"}</Link>
                  ) : (
                    "—"
                  )}
                  {r.paciente_nombre && <span className="texto-suave">{r.paciente_nombre}</span>}
                </td>
                <td>{r.estado_anterior ?? "—"}</td>
                <td>{r.estado_nuevo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && visibles.length === 0 && <p className="empty-state">No hay registros con esos filtros.</p>}
      </div>
    </>
  );
}
