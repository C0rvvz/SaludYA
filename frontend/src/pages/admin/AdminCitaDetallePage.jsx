import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import IndicadorRiesgo from "../../components/admin/IndicadorRiesgo";
import { EstadoBadge, Fila } from "../../components/citas/ElementosCita";
import SelectorNuevoHorario from "../../components/citas/SelectorNuevoHorario";
import {
  agregarObservacionAdmin,
  cancelarCitaAdmin,
  confirmarCitaAdmin,
  enviarRecordatorioAdmin,
  obtenerCitaAdmin,
  registrarContactoAdmin,
  registrarResultadoAdmin,
  reprogramarCitaAdmin,
} from "../../api/admin";
import { CANALES } from "../../utils/citas";
import { capitalizar, formatearFecha, formatearFechaHora, formatearFechaLarga, formatearHora } from "../../utils/formato";

/**
 * Detalle de una cita para el personal:
 * HU-35 detalle e historial de asistencia · HU-36 recordatorio · HU-37 llamar
 * HU-38 confirmar · HU-39 reprogramar · HU-40 cancelar · HU-41 observaciones
 * HU-42 canal de contacto · HU-43 estado y acciones según el estado
 * (+ registrar si fue atendido, que corrige el cierre automático de HU-25).
 */

const RESULTADOS_LLAMADA = [
  ["contesto", "Contestó"],
  ["no_contesto", "No contestó"],
  ["numero_equivocado", "Número equivocado"],
  ["buzon_de_voz", "Buzón de voz"],
];

const TIPOS_DOCUMENTO = {
  cedula_ciudadania: "CC",
  cedula_extranjeria: "CE",
  tarjeta_identidad: "TI",
  pasaporte: "Pasaporte",
};

function Registro({ registro }) {
  return (
    <li>
      <span className="linea-tiempo__fecha">
        {formatearFechaHora(registro.fecha)} · {registro.actor_nombre}
      </span>
      <span>{registro.descripcion}</span>
      {registro.estado_nuevo && registro.estado_anterior && (
        <span className="texto-suave">
          {registro.estado_anterior} → {registro.estado_nuevo}
        </span>
      )}
      {registro.detalle && <span className="texto-suave">“{registro.detalle}”</span>}
    </li>
  );
}

function ListaRegistros({ registros, vacio }) {
  if (registros.length === 0) return <p className="texto-suave">{vacio}</p>;
  return (
    <ol className="linea-tiempo">
      {registros.map((r) => (
        <Registro key={r.id} registro={r} />
      ))}
    </ol>
  );
}

export default function AdminCitaDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [cita, setCita] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(location.state?.aviso ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [panel, setPanel] = useState(null); // cancelar | reprogramar | llamada | resultado
  const [motivo, setMotivo] = useState("");
  const [llamada, setLlamada] = useState({ resultado: "contesto", nota: "" });
  const [observacion, setObservacion] = useState("");

  const cargar = useCallback(
    () =>
      obtenerCitaAdmin(id)
        .then((datos) => {
          setCita(datos);
          setError("");
        })
        .catch((err) => setError(err.message)),
    [id]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Ejecuta una acción; la respuesta ya trae el detalle actualizado (HU-43).
  async function ejecutar(accion, textoExito) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      const actualizada = await accion();
      setCita(actualizada);
      setPanel(null);
      setAviso(textoExito);
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  async function reprogramar(franja) {
    setOcupado(true);
    setError("");
    try {
      const nueva = await reprogramarCitaAdmin(cita.id, franja.id);
      navigate(`/admin/citas/${nueva.id}`, {
        replace: true,
        state: { aviso: `Cita reprogramada. Nuevo comprobante: ${nueva.numero_comprobante}.` },
      });
      setCita(nueva);
      setPanel(null);
      setAviso(`Cita reprogramada. Nuevo comprobante: ${nueva.numero_comprobante}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  async function guardarObservacion(evento) {
    evento.preventDefault();
    if (!observacion.trim()) return;
    setOcupado(true);
    setError("");
    try {
      await agregarObservacionAdmin(cita.paciente.id, observacion.trim(), cita.id);
      setObservacion("");
      setAviso("Observación guardada.");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  if (!cita) {
    return (
      <>
        <Link className="back-link" to="/admin/citas">
          ← Volver a gestión de citas
        </Link>
        {error ? <div className="alert alert--error">{error}</div> : <p>Cargando la cita...</p>}
      </>
    );
  }

  const a = cita.acciones;
  const hayAcciones = a.confirmar || a.recordatorio || a.contactar || a.reprogramar || a.cancelar || a.registrar_resultado;
  const p = cita.paciente;

  return (
    <>
      <Link className="back-link" to="/admin/citas">
        ← Volver a gestión de citas
      </Link>

      <div className="admin-detalle__encabezado">
        <div>
          <h1 className="admin-titulo">{p.nombre}</h1>
          <p className="admin-subtitulo">
            {cita.especialidad} con {cita.especialista} · {formatearFechaLarga(cita.fecha)}, {formatearHora(cita.hora)} ·{" "}
            {cita.sede} ({capitalizar(cita.modalidad)})
          </p>
        </div>
        <div className="admin-detalle__estado">
          <EstadoBadge cita={cita} />
          <span className="comprobante-numero">{cita.numero_comprobante}</span>
        </div>
      </div>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="admin-detalle">
        <div className="admin-detalle__columna">
          <section className="card">
            <h2 className="admin-card__titulo">Datos del paciente</h2>
            <Fila etiqueta="Documento">
              {TIPOS_DOCUMENTO[p.tipo_documento] ?? p.tipo_documento} {p.numero_documento}
            </Fila>
            <Fila etiqueta="Teléfono (WhatsApp)">{p.telefono_whatsapp}</Fila>
            <Fila etiqueta="Correo">{p.correo ?? "—"}</Fila>
            <Fila etiqueta="EPS">{p.eps ?? "—"}</Fila>
            <Fila etiqueta="Afiliación">{capitalizar(p.estado_afiliacion.replace("_", " "))}</Fila>
            {/* HU-42: el canal que eligió el paciente, referencia para contactarlo */}
            <Fila etiqueta="Canal preferido">
              <span className="badge badge--success">{CANALES[cita.canal_recordatorio]}</span>
            </Fila>
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Historial de asistencia</h2>
            <div className="resumen-asistencia">
              <span>
                <strong>{cita.resumen_asistencia.atendidas}</strong> atendidas
              </span>
              <span>
                <strong>{cita.resumen_asistencia.no_asistio}</strong> no asistió
              </span>
              <span>
                <strong>{cita.resumen_asistencia.canceladas}</strong> canceladas
              </span>
              <span>
                <strong>{cita.resumen_asistencia.reprogramadas}</strong> reprogramadas
              </span>
            </div>
            {cita.historial_asistencia.length === 0 ? (
              <p className="texto-suave">Es la única cita de este paciente.</p>
            ) : (
              <ul className="historial-admin">
                {cita.historial_asistencia.slice(0, 10).map((h) => (
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
            <h2 className="admin-card__titulo">Recordatorios enviados</h2>
            {cita.recordatorios.length === 0 && cita.recordatorio_enviado_en ? (
              // Envíos anteriores a la auditoría: solo queda la fecha guardada en la cita.
              <p className="texto-suave">
                Último recordatorio enviado el {formatearFechaHora(cita.recordatorio_enviado_en)} por{" "}
                {CANALES[cita.canal_recordatorio]}.
              </p>
            ) : (
              <ListaRegistros registros={cita.recordatorios} vacio="Todavía no se ha enviado ningún recordatorio." />
            )}
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Llamadas</h2>
            <ListaRegistros registros={cita.contactos} vacio="No se han registrado llamadas." />
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Historial de la cita</h2>
            <ListaRegistros registros={cita.auditoria} vacio="Sin registros." />
          </section>
        </div>

        <div className="admin-detalle__columna">
          {cita.riesgo && (
            <section className="card riesgo-card">
              <h2 className="admin-card__titulo">Nivel estimado de inasistencia</h2>
              <IndicadorRiesgo riesgo={cita.riesgo} grande />
              <p className="texto-suave" style={{ marginTop: "0.75rem" }}>Factores considerados:</p>
              <ul className="factores">
                {cita.riesgo.factores.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="field__hint">
                Estimación por reglas, no un diagnóstico ni una decisión: es una recomendación de acompañamiento,
                nunca un motivo para negar la atención.
              </p>
            </section>
          )}

          <section className="card">
            <h2 className="admin-card__titulo">Acciones</h2>
            {!hayAcciones && (
              <p className="texto-suave">No hay acciones disponibles para esta cita en su estado actual o con su rol.</p>
            )}
            {panel === null && hayAcciones && (
              <div className="acciones-admin">
                {a.confirmar && (
                  <button className="btn btn--success" disabled={ocupado} onClick={() => ejecutar(() => confirmarCitaAdmin(cita.id), "Asistencia confirmada.")}>
                    Confirmar asistencia
                  </button>
                )}
                {a.recordatorio && (
                  <button
                    className="btn btn--outline"
                    disabled={ocupado}
                    onClick={() =>
                      ejecutar(() => enviarRecordatorioAdmin(cita.id), `Recordatorio enviado por ${CANALES[cita.canal_recordatorio]}.`)
                    }
                  >
                    Enviar recordatorio
                  </button>
                )}
                {a.contactar && (
                  <button className="btn btn--outline" onClick={() => setPanel("llamada")}>
                    Llamar al paciente
                  </button>
                )}
                {a.reprogramar && (
                  <button className="btn btn--outline" onClick={() => setPanel("reprogramar")}>
                    Reprogramar
                  </button>
                )}
                {a.cancelar && (
                  <button className="btn btn--peligro-outline" onClick={() => setPanel("cancelar")}>
                    Cancelar cita
                  </button>
                )}
                {a.registrar_resultado && (
                  <button className="btn btn--outline" onClick={() => setPanel("resultado")}>
                    Registrar atención
                  </button>
                )}
              </div>
            )}

            {panel === "llamada" && (
              <div className="panel-admin">
                <p>
                  Llame al <strong>{p.telefono_whatsapp}</strong>{" "}
                  <a className="btn btn--primary btn--compacto" href={`tel:${p.telefono_whatsapp}`}>
                    Llamar ahora
                  </a>
                </p>
                <div className="field">
                  <label htmlFor="resultado_llamada">Resultado de la llamada</label>
                  <select
                    id="resultado_llamada"
                    value={llamada.resultado}
                    onChange={(e) => setLlamada({ ...llamada, resultado: e.target.value })}
                  >
                    {RESULTADOS_LLAMADA.map(([valor, texto]) => (
                      <option key={valor} value={valor}>
                        {texto}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="nota_llamada">Nota (opcional)</label>
                  <input
                    id="nota_llamada"
                    value={llamada.nota}
                    maxLength={500}
                    onChange={(e) => setLlamada({ ...llamada, nota: e.target.value })}
                  />
                </div>
                <div className="acciones-admin">
                  <button
                    className="btn btn--primary"
                    disabled={ocupado}
                    onClick={() =>
                      ejecutar(() => registrarContactoAdmin(cita.id, llamada.resultado, llamada.nota), "Llamada registrada.")
                    }
                  >
                    Registrar llamada
                  </button>
                  <button className="btn btn--outline" onClick={() => setPanel(null)}>
                    Volver
                  </button>
                </div>
              </div>
            )}

            {panel === "cancelar" && (
              <div className="panel-admin panel-admin--peligro">
                <p>
                  <strong>¿Cancelar la cita de {p.nombre}?</strong> El horario quedará libre para otro paciente y se le
                  avisará por {CANALES[cita.canal_recordatorio]}.
                </p>
                <div className="field">
                  <label htmlFor="motivo">Motivo (opcional)</label>
                  <input id="motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
                </div>
                <div className="acciones-admin">
                  <button
                    className="btn btn--peligro"
                    disabled={ocupado}
                    onClick={() => ejecutar(() => cancelarCitaAdmin(cita.id, motivo.trim()), "Cita cancelada y cupo liberado.")}
                  >
                    Sí, cancelar la cita
                  </button>
                  <button className="btn btn--outline" onClick={() => setPanel(null)}>
                    No, volver
                  </button>
                </div>
              </div>
            )}

            {panel === "resultado" && (
              <div className="panel-admin">
                <p>¿El paciente fue atendido en esta cita?</p>
                <div className="acciones-admin">
                  <button
                    className="btn btn--success"
                    disabled={ocupado || cita.estado_visible === "atendida"}
                    onClick={() => ejecutar(() => registrarResultadoAdmin(cita.id, "atendida"), "Se registró que el paciente fue atendido.")}
                  >
                    Sí, fue atendido
                  </button>
                  <button
                    className="btn btn--peligro-outline"
                    disabled={ocupado || cita.estado_visible === "no_asistio"}
                    onClick={() => ejecutar(() => registrarResultadoAdmin(cita.id, "no_asistio"), "Se registró que el paciente no asistió.")}
                  >
                    No asistió
                  </button>
                  <button className="btn btn--outline" onClick={() => setPanel(null)}>
                    Volver
                  </button>
                </div>
              </div>
            )}
          </section>

          {panel === "reprogramar" && (
            <SelectorNuevoHorario
              especialidadId={cita.especialidad_id}
              especialidadNombre={cita.especialidad}
              fechaActual={cita.fecha}
              horaActual={cita.hora}
              ocupado={ocupado}
              onConfirmar={reprogramar}
              onVolver={() => setPanel(null)}
            />
          )}

          {a.observar && (
            <section className="card">
              <h2 className="admin-card__titulo">Observaciones</h2>
              <form onSubmit={guardarObservacion}>
                <div className="field">
                  <label htmlFor="observacion">Nueva observación sobre el paciente o esta cita</label>
                  <textarea
                    id="observacion"
                    rows={3}
                    maxLength={2000}
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                  />
                </div>
                <button className="btn btn--outline btn--compacto" type="submit" disabled={ocupado || !observacion.trim()}>
                  Guardar observación
                </button>
              </form>
              <ul className="observaciones">
                {cita.observaciones.map((o) => (
                  <li key={o.id}>
                    <span className="linea-tiempo__fecha">
                      {formatearFechaHora(o.creado_en)} · {o.autor}
                      {o.numero_comprobante && ` · cita ${o.numero_comprobante}`}
                    </span>
                    <span>{o.texto}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
