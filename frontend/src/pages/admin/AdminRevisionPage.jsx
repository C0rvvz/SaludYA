import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { aprobarSolicitud, enviarSolicitudEps, negarSolicitud, obtenerRevisionClinica } from "../../api/admin";
import { buscarDisponibilidad } from "../../api/catalogo";
import { EstadoBadge, Fila } from "../../components/citas/ElementosCita";
import { usePersonal } from "../../context/personal";
import { CANALES } from "../../utils/citas";
import { capitalizar, formatearFecha, formatearFechaHora, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { ESTADOS_SOLICITUD, TIPOS_CITA, TIPOS_SOLICITUD } from "../../utils/solicitudes";

/**
 * Revisión clínica — HU-78 / HU-79: se llega desde "Ver contexto" con la
 * solicitud elegida; muestra la solicitud y el contexto del paciente
 * (historial, observaciones, lista de espera) y permite continuar el
 * proceso: aprobar asignando la cita, enviar a la EPS o no aprobar.
 */

const POR_DECIDIR = new Set(["pendiente", "pendiente_eps"]);

/** Aprobar: horarios libres de la especialidad desde la fecha que pidió el paciente. */
function PanelAprobar({ solicitud, ocupado, onAprobar, onVolver }) {
  const [horarios, setHorarios] = useState(null);
  const [elegido, setElegido] = useState("");
  const [prioritaria, setPrioritaria] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    buscarDisponibilidad({ especialidad_id: solicitud.especialidad_id })
      .then((lista) => {
        // Desde la fecha solicitada; si no hay, los más próximos que existan.
        const desde = lista.filter((h) => h.fecha >= solicitud.fecha_deseada);
        const opciones = (desde.length ? desde : lista).slice(0, 12);
        setHorarios(opciones);
        setElegido(opciones[0]?.id ?? "");
      })
      .catch((err) => setError(err.message));
  }, [solicitud.especialidad_id, solicitud.fecha_deseada]);

  return (
    <div className="card formulario-admin">
      <h2 className="admin-card__titulo">Aprobar y asignar la cita</h2>
      {error && <div className="alert alert--error">{error}</div>}
      {horarios === null && !error && <p>Buscando horarios...</p>}
      {horarios?.length === 0 && (
        <p className="empty-state">No hay horarios libres de {solicitud.especialidad} en este momento.</p>
      )}
      {horarios?.length > 0 && (
        <>
          <p className="texto-suave">Horarios libres desde el {formatearFechaLarga(solicitud.fecha_deseada)}.</p>
          <div className="channel-grid">
            {horarios.map((h) => (
              <label className="channel-card" key={h.id}>
                <input type="radio" name="horario" checked={elegido === h.id} onChange={() => setElegido(h.id)} />
                <span>
                  {formatearFechaLarga(h.fecha)}, {formatearHora(h.hora)}
                  <span className="texto-suave">
                    {h.especialista.nombre} · {h.sede.nombre} · {capitalizar(h.modalidad)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      <label className="channel-card">
        <input type="checkbox" checked={prioritaria} onChange={(e) => setPrioritaria(e.target.checked)} />{" "}
        Revisión prioritaria
      </label>
      <div className="field">
        <label htmlFor="respuesta_aprobar">Mensaje para el paciente (opcional)</label>
        <textarea id="respuesta_aprobar" rows={2} maxLength={1000} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
      </div>
      <div className="acciones-admin">
        <button
          className="btn btn--success"
          disabled={ocupado || !elegido}
          onClick={() => onAprobar({ disponibilidad_id: elegido, prioritaria, respuesta: respuesta || null })}
        >
          Aprobar y asignar cita
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </div>
  );
}

function PanelTexto({ titulo, etiqueta, boton, obligatorio, peligro, ocupado, onEnviar, onVolver }) {
  const [texto, setTexto] = useState("");
  return (
    <div className={`card formulario-admin ${peligro ? "panel-admin--peligro" : ""}`}>
      <h2 className="admin-card__titulo">{titulo}</h2>
      <div className="field">
        <label htmlFor="texto_decision">{etiqueta}</label>
        <textarea id="texto_decision" rows={3} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <div className="acciones-admin">
        <button
          className={`btn ${peligro ? "btn--peligro" : "btn--primary"}`}
          disabled={ocupado || (obligatorio && texto.trim().length < 5)}
          onClick={() => onEnviar(texto.trim())}
        >
          {boton}
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </div>
  );
}

export default function AdminRevisionPage() {
  const { id } = useParams();
  const { tienePermiso } = usePersonal();
  const [revision, setRevision] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [panel, setPanel] = useState(null); // aprobar | eps | negar

  const cargar = useCallback(
    () =>
      obtenerRevisionClinica(id)
        .then(setRevision)
        .catch((err) => setError(err.message)),
    [id]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function decidir(fn, mensaje) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      setRevision(await fn());
      setAviso(mensaje);
      setPanel(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  if (!revision) {
    return error ? <div className="alert alert--error">{error}</div> : <p>Cargando revisión...</p>;
  }

  const s = revision.solicitud;
  const p = revision.paciente;
  const [estado, clase] = ESTADOS_SOLICITUD[s.estado];
  const puedeDecidir = tienePermiso("revisar_solicitudes") && POR_DECIDIR.has(s.estado);

  return (
    <>
      <Link to="/admin/solicitudes" className="texto-suave">
        ← Volver a las solicitudes
      </Link>

      <div className="admin-detalle__encabezado">
        <div>
          <h1 className="admin-titulo">Revisión clínica</h1>
          <p className="admin-subtitulo">
            {TIPOS_SOLICITUD[s.tipo]} de {p.nombre}: {s.especialidad} ({TIPOS_CITA[s.tipo_cita].toLowerCase()}) para el{" "}
            {formatearFechaLarga(s.fecha_deseada)}
          </p>
        </div>
        <div className="admin-detalle__estado">
          <span className={`badge ${clase}`}>{estado}</span>
          <span className="comprobante-numero">{s.numero_radicado}</span>
        </div>
      </div>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {panel === "aprobar" && (
        <PanelAprobar
          solicitud={s}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onAprobar={(datos) => decidir(() => aprobarSolicitud(s.id, datos), "Solicitud aprobada y cita asignada.")}
        />
      )}
      {panel === "eps" && (
        <PanelTexto
          titulo="Enviar a la EPS para autorización"
          etiqueta="Nota para el paciente (opcional)"
          boton="Enviar a la EPS"
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onEnviar={(texto) => decidir(() => enviarSolicitudEps(s.id, texto), "Solicitud enviada a la EPS.")}
        />
      )}
      {panel === "negar" && (
        <PanelTexto
          titulo={s.estado === "pendiente_eps" ? "Registrar que la EPS no la autorizó" : "No aprobar la solicitud"}
          etiqueta="Motivo (se le envía al paciente)"
          boton="No aprobar"
          obligatorio
          peligro
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onEnviar={(texto) => decidir(() => negarSolicitud(s.id, texto), "Solicitud no aprobada.")}
        />
      )}

      <div className="admin-detalle">
        <div className="admin-detalle__columna">
          <section className="card">
            <h2 className="admin-card__titulo">Solicitud</h2>
            <Fila etiqueta="Tipo">{TIPOS_SOLICITUD[s.tipo]}</Fila>
            <Fila etiqueta="Especialidad">{s.especialidad}</Fila>
            <Fila etiqueta="Tipo de cita">{TIPOS_CITA[s.tipo_cita]}</Fila>
            <Fila etiqueta="Fecha solicitada">{formatearFechaLarga(s.fecha_deseada)}</Fila>
            <Fila etiqueta="Radicada">{formatearFechaHora(s.radicada_en)}</Fila>
            <Fila etiqueta="Canal para avisarle">{CANALES[s.canal]}</Fila>
            <p className="revision__motivo">{s.motivo}</p>
          </section>

          {(s.revisada_en || s.respuesta) && (
            <section className="card">
              <h2 className="admin-card__titulo">Decisión</h2>
              {s.revisor && <Fila etiqueta="Revisó">{s.revisor}</Fila>}
              {s.revisada_en && <Fila etiqueta="Revisada">{formatearFechaHora(s.revisada_en)}</Fila>}
              {s.estado === "aprobada" && <Fila etiqueta="Prioritaria">{s.prioritaria ? "Sí" : "No"}</Fila>}
              {s.enviada_eps_en && <Fila etiqueta="Enviada a la EPS">{formatearFechaHora(s.enviada_eps_en)}</Fila>}
              {s.respuesta_eps_en && <Fila etiqueta="Respuesta de la EPS">{formatearFechaHora(s.respuesta_eps_en)}</Fila>}
              {s.cita && (
                <Fila etiqueta="Cita asignada">
                  <Link to={`/admin/citas/${s.cita.id}`}>
                    {formatearFecha(s.cita.fecha)}, {formatearHora(s.cita.hora)} · {s.cita.especialista}
                  </Link>
                </Fila>
              )}
              {s.respuesta && <p className="revision__motivo">{s.respuesta}</p>}
            </section>
          )}

          {puedeDecidir && panel === null && (
            <section className="card">
              <h2 className="admin-card__titulo">
                {s.estado === "pendiente_eps" ? "Respuesta de la EPS" : "Continuar la revisión"}
              </h2>
              <div className="acciones-admin">
                <button className="btn btn--success" onClick={() => setPanel("aprobar")}>
                  Aprobar y asignar cita
                </button>
                {s.estado === "pendiente" && (
                  <button className="btn btn--outline" onClick={() => setPanel("eps")}>
                    Enviar a la EPS
                  </button>
                )}
                <button className="btn btn--peligro-outline" onClick={() => setPanel("negar")}>
                  No aprobar
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="admin-detalle__columna">
          <section className="card">
            <h2 className="admin-card__titulo">Paciente</h2>
            <Fila etiqueta="Nombre">{p.nombre}</Fila>
            <Fila etiqueta="Documento">
              {p.tipo_documento} {p.numero_documento}
            </Fila>
            <Fila etiqueta="Teléfono (WhatsApp)">{p.telefono_whatsapp}</Fila>
            <Fila etiqueta="EPS">{p.eps ?? "—"}</Fila>
            <Fila etiqueta="Afiliación">{capitalizar(p.estado_afiliacion.replace("_", " "))}</Fila>
            <Fila etiqueta="Lista de espera">
              {revision.en_lista_espera.length ? revision.en_lista_espera.join(", ") : "No está en lista de espera"}
            </Fila>
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Historial de citas</h2>
            <div className="resumen-asistencia">
              <span>
                <strong>{revision.resumen_asistencia.atendidas}</strong> atendidas
              </span>
              <span>
                <strong>{revision.resumen_asistencia.no_asistio}</strong> no asistió
              </span>
              <span>
                <strong>{revision.resumen_asistencia.canceladas}</strong> canceladas
              </span>
            </div>
            {revision.historial.length === 0 ? (
              <p className="texto-suave">No tiene citas registradas.</p>
            ) : (
              <ul className="historial-admin">
                {revision.historial.slice(0, 10).map((h) => (
                  <li key={h.id}>
                    <Link to={`/admin/citas/${h.id}`}>
                      {formatearFecha(h.fecha)} · {h.especialidad}
                    </Link>
                    <EstadoBadge cita={h} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Observaciones</h2>
            {revision.observaciones.length === 0 ? (
              <p className="texto-suave">Sin observaciones del personal.</p>
            ) : (
              <ul className="observaciones">
                {revision.observaciones.map((o) => (
                  <li key={o.id}>
                    <span className="texto-suave">
                      {formatearFechaHora(o.creado_en)} · {o.autor}
                    </span>
                    <span>{o.texto}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
