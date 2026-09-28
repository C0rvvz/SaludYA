import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import IndicadorRiesgo from "../../components/admin/IndicadorRiesgo";
import { EstadoBadge } from "../../components/citas/ElementosCita";
import { confirmarCitaAdmin, enviarRecordatorioAdmin, listarCitasAdmin } from "../../api/admin";
import { listarEspecialidades } from "../../api/catalogo";
import { CANALES } from "../../utils/citas";
import { formatearFecha, formatearFechaHora, formatearHora } from "../../utils/formato";

/**
 * Gestión de citas — HU-34 (lista con la información relevante) y HU-43
 * (estado de cada cita y las acciones permitidas según su estado).
 * El detalle (HU-35 a HU-42) está en AdminCitaDetallePage.
 */

const ESTADOS = [
  ["", "Todos los estados"],
  ["pendiente_confirmar", "Pendiente de confirmar asistencia"],
  ["asistencia_confirmada", "Asistencia confirmada"],
  ["llegada_registrada", "Llegada registrada"],
  ["finalizada", "En espera de registro de atención"],
  ["atendida", "Atendida"],
  ["no_asistio", "No asistió"],
  ["cancelada", "Cancelada"],
  ["reprogramada", "Reprogramada"],
];

const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

export default function AdminCitasPage() {
  const [filtros, setFiltros] = useState(() => ({
    buscar: "",
    desde: hoy(),
    hasta: "",
    especialidad_id: "",
    estado: "",
  }));
  const [especialidades, setEspecialidades] = useState([]);
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);

  const cargar = useCallback(
    (f) =>
      listarCitasAdmin(f)
        .then((datos) => {
          setCitas(datos);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setCargando(false)),
    []
  );

  useEffect(() => {
    listarEspecialidades().then(setEspecialidades).catch(() => {});
    cargar(filtros);
    // Solo al entrar; después se busca con el botón "Buscar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buscar(evento) {
    evento.preventDefault();
    setCargando(true);
    setAviso(null);
    cargar(filtros);
  }

  async function accionRapida(cita, accion, texto) {
    setProcesandoId(cita.id);
    setAviso(null);
    try {
      await accion(cita.id);
      setAviso({ tipo: "success", texto });
      await cargar(filtros);
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setProcesandoId(null);
    }
  }

  const riesgoAlto = citas.filter((c) => c.riesgo?.nivel === "alto").length;

  return (
    <>
      <h1 className="admin-titulo">Gestión de citas</h1>
      <p className="admin-subtitulo">Citas de todos los pacientes, con su estado y el nivel estimado de inasistencia.</p>

      <div className="info-admin">
        El nivel estimado de inasistencia es solo una recomendación de acompañamiento (llamar, recordar,
        confirmar). Nunca debe usarse para negar la atención a un paciente.
      </div>

      <form className="filters-card filtros-admin" onSubmit={buscar}>
        <div className="field">
          <label htmlFor="buscar">Paciente, documento o comprobante</label>
          <input
            id="buscar"
            value={filtros.buscar}
            onChange={(e) => setFiltros({ ...filtros, buscar: e.target.value })}
            placeholder="Ej. 1234567890 o SAY-..."
          />
        </div>
        <div className="field">
          <label htmlFor="desde">Desde</label>
          <input id="desde" type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="hasta">Hasta</label>
          <input id="hasta" type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="especialidad_id">Especialidad</label>
          <select
            id="especialidad_id"
            value={filtros.especialidad_id}
            onChange={(e) => setFiltros({ ...filtros, especialidad_id: e.target.value })}
          >
            <option value="">Todas</option>
            {especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="estado">Estado</label>
          <select id="estado" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
            {ESTADOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn--primary" type="submit" disabled={cargando}>
          {cargando ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {aviso && <div className={`alert alert--${aviso.tipo}`}>{aviso.texto}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {!cargando && (
        <p className="texto-suave">
          {citas.length} {citas.length === 1 ? "cita" : "citas"}
          {riesgoAlto > 0 && ` · ${riesgoAlto} con riesgo alto de inasistencia`}
        </p>
      )}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Especialidad</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Nivel estimado</th>
              <th>Recordatorio</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {citas.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.paciente.nombre}</strong>
                  <span className="texto-suave">Doc. {c.paciente.numero_documento}</span>
                </td>
                <td>
                  {c.especialidad}
                  <span className="texto-suave">{c.especialista}</span>
                </td>
                <td>
                  {formatearFecha(c.fecha)}
                  <span className="texto-suave">{formatearHora(c.hora)}</span>
                </td>
                <td>
                  <EstadoBadge cita={c} />
                </td>
                <td>
                  <IndicadorRiesgo riesgo={c.riesgo} />
                </td>
                <td>
                  {c.recordatorio_enviado_en ? (
                    <span className="texto-suave">Enviado {formatearFechaHora(c.recordatorio_enviado_en)}</span>
                  ) : (
                    <span className="texto-suave">No enviado</span>
                  )}
                  <span className="texto-suave">Por {CANALES[c.canal_recordatorio]}</span>
                </td>
                <td>
                  <div className="acciones-tabla">
                    <Link to={`/admin/citas/${c.id}`} className="btn btn--primary btn--compacto">
                      Ver detalle
                    </Link>
                    {c.acciones.confirmar && (
                      <button
                        type="button"
                        className="btn btn--outline btn--compacto"
                        disabled={procesandoId === c.id}
                        onClick={() => accionRapida(c, confirmarCitaAdmin, `Asistencia de ${c.paciente.nombre} confirmada.`)}
                      >
                        Confirmar
                      </button>
                    )}
                    {c.acciones.recordatorio && (
                      <button
                        type="button"
                        className="btn btn--outline btn--compacto"
                        disabled={procesandoId === c.id}
                        onClick={() =>
                          accionRapida(c, enviarRecordatorioAdmin, `Recordatorio enviado a ${c.paciente.nombre} por ${CANALES[c.canal_recordatorio]}.`)
                        }
                      >
                        Recordatorio
                      </button>
                    )}
                    {c.acciones.contactar && (
                      <a
                        className="btn btn--outline btn--compacto"
                        href={`tel:${c.paciente.telefono_whatsapp}`}
                        aria-label={`Llamar a ${c.paciente.nombre}`}
                      >
                        Llamar
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && citas.length === 0 && <p className="empty-state">No hay citas con esos filtros.</p>}
      </div>
    </>
  );
}
