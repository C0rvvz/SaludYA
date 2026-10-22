import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listarSolicitudesAdmin } from "../../api/admin";
import { Cifra } from "../../components/admin/Reportes";
import { iniciales } from "../../utils/avatar";
import { formatearSoloFecha } from "../../utils/formato";
import {
  ESTADOS_SOLICITUD,
  ESTADO_SOLICITUD_CORTO,
  GRUPOS_SOLICITUD,
  TIPOS_CITA,
  TIPOS_SOLICITUD_PERSONAL,
} from "../../utils/solicitudes";

const POR_DECIDIR = new Set(["pendiente", "pendiente_eps"]);

// "14 oct"
const diaCorto = (fechaIso) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
    .format(new Date(fechaIso))
    .replace(".", "")
    .replace(" de ", " ");

/**
 * Solicitudes (cartas de solicitud y derechos de petición) — HU-76:
 * paciente, tipo de cita, especialidad y fecha solicitada; HU-77: su
 * estado, con las pendientes primero; HU-78: "Revisar" lleva a la
 * revisión clínica.
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
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Solicitudes</h1>
          <p className="admin-subtitulo">
            Cartas de solicitud de cita y derechos de petición radicados por los pacientes. Los derechos de petición
            deben responderse en un plazo máximo de 15 días hábiles. Las solicitudes pendientes se muestran primero.
          </p>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {solicitudes && (
        <>
          <section className="card" aria-label="Resumen de las solicitudes">
            <div className="cifras">
              <Cifra valor={contar("pendiente")} nombre="Pendientes de revisión" tono="aviso" />
              <Cifra valor={contar("pendiente_eps")} nombre="En trámite con la EPS" />
              <Cifra valor={contar("aprobada")} nombre="Aprobadas" tono="exito" />
              <Cifra valor={contar("negada")} nombre="No aprobadas" />
            </div>
          </section>

          <div className="chips-estado" role="group" aria-label="Filtrar por estado">
            {[["", "Todas", todas.length], ...GRUPOS_SOLICITUD.map(([v, n]) => [v, n, contar(v)])].map(
              ([valor, nombre, total]) => (
                <button
                  key={valor || "todas"}
                  type="button"
                  className={`chip-estado ${estado === valor ? "is-activo" : ""}`}
                  aria-pressed={estado === valor}
                  onClick={() => setEstado(valor)}
                >
                  {nombre} <span className="chip-estado__conteo">{total}</span>
                </button>
              )
            )}
          </div>
        </>
      )}

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
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((s) => {
              const clase = ESTADOS_SOLICITUD[s.estado][1];
              const porDecidir = POR_DECIDIR.has(s.estado);
              return (
                <tr key={s.id}>
                  <td>
                    <span className="celda-doble">
                      <span className="admin-comprobante admin-comprobante--fuerte">{s.numero_radicado}</span>
                      <span className="celda-doble__dato">
                        {TIPOS_SOLICITUD_PERSONAL[s.tipo]} · {diaCorto(s.radicada_en)}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="celda-persona">
                      <span className="celda-persona__iniciales" aria-hidden="true">
                        {iniciales(s.paciente_nombre)}
                      </span>
                      <span className="celda-persona__nombre">{s.paciente_nombre}</span>
                    </span>
                  </td>
                  <td>{TIPOS_CITA[s.tipo_cita]}</td>
                  <td>{s.especialidad}</td>
                  <td className="celda-fecha">{formatearSoloFecha(`${s.fecha_deseada}T00:00:00`)}</td>
                  <td>
                    <span className="celda-doble">
                      <span>
                        <span className={`badge ${clase}`}>{ESTADO_SOLICITUD_CORTO[s.estado]}</span>
                      </span>
                      {s.prioritaria && <span className="celda-doble__aviso">Prioritaria</span>}
                    </span>
                  </td>
                  <td>
                    <Link
                      className={`btn btn--compacto ${porDecidir ? "btn--primary" : "btn--outline"}`}
                      to={`/admin/solicitudes/${s.id}`}
                      aria-label={`${porDecidir ? "Revisar" : "Ver"} la solicitud ${s.numero_radicado}`}
                    >
                      {porDecidir ? "Revisar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {solicitudes && visibles.length === 0 && <p className="tabla-vacia">No hay solicitudes con ese estado.</p>}
      </div>
    </>
  );
}
