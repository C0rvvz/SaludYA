import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listarSolicitudesAdmin } from "../../api/admin";
import { Cifra } from "../../components/admin/Reportes";
import { formatearFecha, formatearFechaHora } from "../../utils/formato";
import { ESTADOS_SOLICITUD, TIPOS_CITA, TIPOS_SOLICITUD } from "../../utils/solicitudes";

/**
 * Solicitudes de cita (cartas de petición) — HU-76: paciente, tipo de
 * cita, especialidad y fecha solicitada; HU-77: su estado, con las
 * pendientes primero; HU-78: "Ver contexto" lleva a la revisión clínica.
 */
export default function AdminSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");

  useEffect(() => {
    listarSolicitudesAdmin()
      .then(setSolicitudes)
      .catch((err) => setError(err.message));
  }, []);

  const todas = solicitudes ?? [];
  const visibles = estado ? todas.filter((s) => s.estado === estado) : todas;
  const contar = (e) => todas.filter((s) => s.estado === e).length;

  return (
    <>
      <h1 className="admin-titulo">Solicitudes</h1>
      <p className="admin-subtitulo">
        Solicitudes formales y derechos de petición que radican los pacientes para pedir una cita. Las pendientes
        aparecen primero.
      </p>

      {error && <div className="alert alert--error">{error}</div>}

      {solicitudes && (
        <div className="cifras lista-espera-admin__cifras">
          <Cifra valor={contar("pendiente")} nombre="Pendientes de revisión" />
          <Cifra valor={contar("pendiente_eps")} nombre="En trámite con la EPS" />
          <Cifra valor={contar("aprobada")} nombre="Aprobadas" />
          <Cifra valor={contar("negada")} nombre="No aprobadas" />
        </div>
      )}

      <div className="filters-card filtros-admin filtros-admin--periodo">
        <div className="field">
          <label htmlFor="estado">Estado</label>
          <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ESTADOS_SOLICITUD).map(([valor, [texto]]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Radicado</th>
              <th>Paciente</th>
              <th>Tipo de cita</th>
              <th>Especialidad</th>
              <th>Fecha solicitada</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((s) => {
              const [texto, clase] = ESTADOS_SOLICITUD[s.estado];
              return (
                <tr key={s.id}>
                  <td>
                    {s.numero_radicado}
                    <span className="texto-suave">
                      {TIPOS_SOLICITUD[s.tipo]} · {formatearFechaHora(s.radicada_en)}
                    </span>
                  </td>
                  <td>{s.paciente_nombre}</td>
                  <td>{TIPOS_CITA[s.tipo_cita]}</td>
                  <td>{s.especialidad}</td>
                  <td>{formatearFecha(s.fecha_deseada)}</td>
                  <td>
                    <span className={`badge ${clase}`}>{texto}</span>
                    {s.prioritaria && <span className="texto-suave">Prioritaria</span>}
                  </td>
                  <td>
                    <Link className="btn btn--outline btn--compacto" to={`/admin/solicitudes/${s.id}`}>
                      Ver contexto
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {solicitudes && visibles.length === 0 && <p className="empty-state">No hay solicitudes con ese estado.</p>}
      </div>
    </>
  );
}
