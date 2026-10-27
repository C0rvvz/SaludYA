import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { aprobarSolicitud, enviarSolicitudEps, negarSolicitud, obtenerRevisionClinica } from "../../api/admin";
import { buscarDisponibilidad } from "../../api/catalogo";
import { Cifra } from "../../components/admin/Reportes";
import TablaHistorial from "../../components/admin/TablaHistorial";
import { Chevron } from "../../components/Iconos";
import { Fila } from "../../components/citas/ElementosCita";
import { usePersonal } from "../../context/personal";
import { AFILIACION, CANALES, epsDelPaciente } from "../../utils/citas";
import { capitalizar, formatearFecha, formatearFechaHora, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { ESTADOS_SOLICITUD, TIPOS_CITA, TIPOS_SOLICITUD_PERSONAL } from "../../utils/solicitudes";

/**
 * Revisión clínica — HU-78 / HU-79: se llega desde "Revisar" con la
 * solicitud elegida; muestra la solicitud y el contexto del paciente
 * (historial, observaciones, lista de espera) y permite decidir: aprobar
 * asignando la cita, remitir a la EPS o no aprobar.
 */

const POR_DECIDIR = new Set(["pendiente", "pendiente_eps"]);

// "15 de noviembre" (sin "Sábado, ")
const sinDiaDeLaSemana = (fechaIso) => formatearFechaLarga(fechaIso).replace(/^[^,]+, /, "");

/**
 * Decidir: los horarios libres de la especialidad desde la fecha que pidió
 * el paciente (si no hay, los más próximos), la revisión prioritaria y los
 * botones "Aprobar y asignar cita", "Remitir a la EPS" y "No aprobar".
 */
function Decision({ solicitud, paraEps, ocupado, onAprobar, onRemitir, onNegar }) {
  const [horarios, setHorarios] = useState(null);
  const [elegido, setElegido] = useState("");
  const [prioritaria, setPrioritaria] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Solo médicos de la EPS del paciente o de una aliada.
    buscarDisponibilidad({ especialidad_id: solicitud.especialidad_id, para_eps: paraEps })
      .then((lista) => {
        const desde = lista.filter((h) => h.fecha >= solicitud.fecha_deseada);
        const opciones = (desde.length ? desde : lista).slice(0, 12);
        setHorarios(opciones);
        setElegido(opciones[0]?.id ?? "");
      })
      .catch((err) => setError(err.message));
  }, [solicitud.especialidad_id, solicitud.fecha_deseada, paraEps]);

  const desdeLaFecha = horarios?.some((h) => h.fecha >= solicitud.fecha_deseada);

  return (
    <>
      {error && <div className="alert alert--error">{error}</div>}
      {horarios === null && !error && <p className="texto-suave">Buscando horarios…</p>}
      {horarios?.length === 0 && (
        <p className="texto-suave">No hay horarios libres de {solicitud.especialidad} en este momento.</p>
      )}
      {horarios?.length > 0 && (
        <fieldset className="opciones-admin">
          <legend>
            {desdeLaFecha
              ? `Horarios disponibles desde el ${sinDiaDeLaSemana(solicitud.fecha_deseada)}`
              : "No hay horarios desde la fecha solicitada; estos son los más próximos"}
          </legend>
          {horarios.map((h) => (
            <label className="opcion-admin" key={h.id}>
              <input type="radio" name="horario" checked={elegido === h.id} onChange={() => setElegido(h.id)} />
              <span className="opcion-admin__textos">
                <span className="opcion-admin__titulo">
                  {formatearFechaLarga(h.fecha)}, {formatearHora(h.hora)}
                </span>
                <span className="opcion-admin__detalle">
                  {h.especialista.nombre} · {h.sede.nombre} · {capitalizar(h.modalidad)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="opcion-admin opcion-admin--casilla">
        <input type="checkbox" checked={prioritaria} onChange={(e) => setPrioritaria(e.target.checked)} />
        <span className="opcion-admin__titulo">Marcar como revisión prioritaria</span>
      </label>
      <div className="field">
        <label htmlFor="respuesta_aprobar">Mensaje para el paciente <span className="opcional">(opcional)</span></label>
        <textarea
          id="respuesta_aprobar"
          rows={2}
          maxLength={1000}
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
        />
      </div>
      <div className="acciones-admin">
        <button
          className="btn btn--primary"
          disabled={ocupado || !elegido}
          onClick={() => onAprobar({ disponibilidad_id: elegido, prioritaria, respuesta: respuesta || null })}
        >
          Aprobar y asignar cita
        </button>
        {onRemitir && (
          <button className="btn btn--outline" onClick={onRemitir}>
            Remitir a la EPS
          </button>
        )}
        <button className="btn btn--peligro-outline" onClick={onNegar}>
          No aprobar
        </button>
      </div>
    </>
  );
}

/** Remitir a la EPS o no aprobar: un texto y la confirmación. */
function PanelTexto({ etiqueta, boton, obligatorio, peligro, ocupado, onEnviar, onVolver }) {
  const [texto, setTexto] = useState("");
  return (
    <>
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
    </>
  );
}

export default function AdminRevisionPage() {
  const { id } = useParams();
  const { tienePermiso } = usePersonal();
  const [revision, setRevision] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [paso, setPaso] = useState(null); // null (decidir) | "eps" | "negar"

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
      setPaso(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  const volver = (
    <Link className="admin-volver" to="/admin/solicitudes">
      <span className="admin-volver__circulo">
        <Chevron hacia="izquierda" tamano={14} />
      </span>
      Volver a Solicitudes
    </Link>
  );

  if (!revision) {
    return (
      <>
        {volver}
        {error ? <div className="alert alert--error">{error}</div> : <p className="texto-suave">Cargando la revisión…</p>}
      </>
    );
  }

  const s = revision.solicitud;
  const p = revision.paciente;
  const [estado, clase] = ESTADOS_SOLICITUD[s.estado];
  const puedeDecidir = tienePermiso("revisar_solicitudes") && POR_DECIDIR.has(s.estado);
  const conEps = s.estado === "pendiente_eps";

  let tituloDecision = conEps ? "Respuesta de la EPS" : "Decisión";
  if (paso === "eps") tituloDecision = "Remitir a la EPS para autorización";
  if (paso === "negar") tituloDecision = conEps ? "Registrar que la EPS no la autorizó" : "No aprobar la solicitud";

  return (
    <>
      {volver}

      <div className="admin-detalle__encabezado">
        <div>
          <h1 className="admin-titulo">Revisión clínica</h1>
          <p className="admin-subtitulo">
            {TIPOS_SOLICITUD_PERSONAL[s.tipo]} · {p.nombre} · {s.especialidad}, {TIPOS_CITA[s.tipo_cita].toLowerCase()} ·
            Fecha solicitada: {sinDiaDeLaSemana(s.fecha_deseada)}
          </p>
        </div>
        <div className="admin-detalle__estado">
          <span className={`badge ${clase}`}>{estado}</span>
          <span className="admin-comprobante">{s.numero_radicado}</span>
        </div>
      </div>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="admin-detalle">
        <div className="admin-detalle__columna">
          <section className="card">
            <h2 className="admin-card__titulo">Solicitud</h2>
            <div>
              <Fila etiqueta="Tipo">{TIPOS_SOLICITUD_PERSONAL[s.tipo]}</Fila>
              <Fila etiqueta="Especialidad">{s.especialidad}</Fila>
              <Fila etiqueta="Tipo de cita">{TIPOS_CITA[s.tipo_cita]}</Fila>
              <Fila etiqueta="Fecha solicitada">{formatearFechaLarga(s.fecha_deseada)}</Fila>
              <Fila etiqueta="Fecha de radicación">{formatearFechaHora(s.radicada_en)}</Fila>
              <Fila etiqueta="Canal de notificación">{CANALES[s.canal]}</Fila>
            </div>
            <blockquote className="revision__motivo">{s.motivo}</blockquote>
          </section>

          {puedeDecidir && (
            <section className="card" aria-labelledby="titulo-decision">
              <h2 className="admin-card__titulo" id="titulo-decision">
                {tituloDecision}
              </h2>
              {paso === null && (
                <Decision
                  solicitud={s}
                  paraEps={p.eps_id}
                  ocupado={ocupado}
                  onAprobar={(datos) =>
                    decidir(() => aprobarSolicitud(s.id, datos), "Solicitud aprobada y cita asignada.")
                  }
                  // Un particular no tiene EPS a la cual remitirla.
                  onRemitir={conEps || !p.eps ? null : () => setPaso("eps")}
                  onNegar={() => setPaso("negar")}
                />
              )}
              {paso === "eps" && (
                <PanelTexto
                  etiqueta={<>Nota para el paciente <span className="opcional">(opcional)</span></>}
                  boton="Remitir a la EPS"
                  ocupado={ocupado}
                  onVolver={() => setPaso(null)}
                  onEnviar={(texto) => decidir(() => enviarSolicitudEps(s.id, texto), "Solicitud remitida a la EPS.")}
                />
              )}
              {paso === "negar" && (
                <PanelTexto
                  etiqueta="Motivo (se le envía al paciente)"
                  boton="No aprobar"
                  obligatorio
                  peligro
                  ocupado={ocupado}
                  onVolver={() => setPaso(null)}
                  onEnviar={(texto) => decidir(() => negarSolicitud(s.id, texto), "Solicitud no aprobada.")}
                />
              )}
            </section>
          )}

          {(s.revisada_en || s.respuesta) && (
            <section className="card">
              <h2 className="admin-card__titulo">Resultado de la revisión</h2>
              <div>
                {s.revisor && <Fila etiqueta="Revisó">{s.revisor}</Fila>}
                {s.revisada_en && <Fila etiqueta="Revisada">{formatearFechaHora(s.revisada_en)}</Fila>}
                {s.estado === "aprobada" && <Fila etiqueta="Prioritaria">{s.prioritaria ? "Sí" : "No"}</Fila>}
                {s.enviada_eps_en && <Fila etiqueta="Remitida a la EPS">{formatearFechaHora(s.enviada_eps_en)}</Fila>}
                {s.respuesta_eps_en && (
                  <Fila etiqueta="Respuesta de la EPS">{formatearFechaHora(s.respuesta_eps_en)}</Fila>
                )}
                {s.cita && (
                  <Fila etiqueta="Cita asignada">
                    <Link to={`/admin/citas/${s.cita.id}`}>
                      {formatearFecha(s.cita.fecha)}, {formatearHora(s.cita.hora)} · {s.cita.especialista}
                    </Link>
                  </Fila>
                )}
              </div>
              {s.respuesta && <p className="revision__motivo">{s.respuesta}</p>}
            </section>
          )}
        </div>

        <div className="admin-detalle__columna">
          <section className="card">
            <h2 className="admin-card__titulo">Paciente</h2>
            <div>
              <Fila etiqueta="Nombre">{p.nombre}</Fila>
              <Fila etiqueta="Documento">
                {p.tipo_documento} {p.numero_documento}
              </Fila>
              <Fila etiqueta="Teléfono (WhatsApp)">{p.telefono_whatsapp}</Fila>
              <Fila etiqueta="EPS">{epsDelPaciente(p)}</Fila>
              <Fila etiqueta="Estado de afiliación">{AFILIACION[p.estado_afiliacion] ?? p.estado_afiliacion}</Fila>
              <Fila etiqueta="Lista de espera">
                {revision.en_lista_espera.length ? revision.en_lista_espera.join(", ") : "No está en lista de espera"}
              </Fila>
            </div>
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Historial de citas</h2>
            <div className="cifras">
              <Cifra nombre="Atendidas" valor={revision.resumen_asistencia.atendidas} />
              <Cifra
                nombre="Inasistencias"
                valor={revision.resumen_asistencia.no_asistio}
                tono={revision.resumen_asistencia.no_asistio ? "peligro" : undefined}
              />
              <Cifra nombre="Canceladas" valor={revision.resumen_asistencia.canceladas} />
            </div>
            <TablaHistorial citas={revision.historial} vacio="No tiene citas registradas." />
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Observaciones del personal</h2>
            {revision.observaciones.length === 0 ? (
              <p className="texto-suave">Sin observaciones del personal.</p>
            ) : (
              <ul className="observaciones">
                {revision.observaciones.map((o) => (
                  <li key={o.id}>
                    <span className="linea-tiempo__fecha">
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
