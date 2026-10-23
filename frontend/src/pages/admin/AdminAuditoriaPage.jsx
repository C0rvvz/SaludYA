import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listarAuditoria } from "../../api/admin";
import { IconoBuscar } from "../../components/admin/IconosAdmin";
import FechaHora from "../../components/FechaHora";

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
  unirse_lista_espera: "Unirse a la lista de espera",
  ofrecer_cupo: "Ofrecer cupo (lista de espera)",
  rechazar_cupo: "Rechazar cupo (lista de espera)",
  vencer_cupo: "Cupo vencido (lista de espera)",
  salir_lista_espera: "Salir de la lista de espera",
  prioridad_lista_espera: "Prioridad (lista de espera)",
  radicar_solicitud: "Radicar solicitud",
  aprobar_solicitud: "Aprobar solicitud",
  enviar_eps_solicitud: "Enviar solicitud a la EPS",
  negar_solicitud: "No aprobar solicitud",
  programar_recordatorio: "Programar recordatorio",
  editar_recordatorio: "Editar recordatorio",
  cancelar_recordatorio: "Cancelar recordatorio",
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
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Auditoría</h1>
          <p className="admin-subtitulo">
            Registro de las acciones realizadas por pacientes, personal y sistema sobre las citas. Los registros no
            pueden modificarse ni eliminarse.
          </p>
        </div>
      </div>

      <div className="filtros-admin filtros-admin--auditoria">
        <div className="field">
          <label htmlFor="texto">Buscar</label>
          <div className="campo-con-icono">
            <IconoBuscar />
            <input
              id="texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej. paciente, responsable o comprobante"
            />
          </div>
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
              <th>Responsable</th>
              <th>Acción</th>
              <th>Cita</th>
              <th>Estado anterior</th>
              <th>Estado nuevo</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.id}>
                <td>
                  <FechaHora valor={r.fecha} />
                </td>
                <td className="celda-persona__nombre">{r.actor_nombre}</td>
                <td>
                  <span className="celda-doble">
                    <span>{r.descripcion}</span>
                    {r.detalle && <span className="celda-doble__dato">“{r.detalle}”</span>}
                  </span>
                </td>
                <td>
                  <span className="celda-doble">
                    {r.cita_id ? (
                      <Link className="admin-comprobante admin-comprobante--enlace" to={`/admin/citas/${r.cita_id}`}>
                        {r.numero_comprobante ?? "Ver cita"}
                      </Link>
                    ) : (
                      <span>—</span>
                    )}
                    {r.paciente_nombre && <span className="celda-doble__dato">{r.paciente_nombre}</span>}
                  </span>
                </td>
                <td>{r.estado_anterior ?? "—"}</td>
                <td>{r.estado_nuevo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && visibles.length === 0 && <p className="tabla-vacia">No hay registros con esos filtros.</p>}
      </div>
    </>
  );
}
