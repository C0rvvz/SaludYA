import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { IconoCandado } from "../../components/admin/IconosAdmin";
import IndicadorRiesgo from "../../components/admin/IndicadorRiesgo";
import { Cifra } from "../../components/admin/Reportes";
import TablaHistorial from "../../components/admin/TablaHistorial";
import { Chevron } from "../../components/Iconos";
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
import { AFILIACION, CANALES, SIGLA_DOCUMENTO, epsDelPaciente } from "../../utils/citas";
import { formatearFechaHora, formatearFechaLarga, formatearHora } from "../../utils/formato";

/**
 * Detalle de una cita para el personal:
 * HU-35 detalle e historial de asistencia · HU-36 recordatorio · HU-37 llamar
 * HU-38 confirmar · HU-39 reprogramar · HU-40 cancelar · HU-41 observaciones
 * HU-42 canal de contacto · HU-43 estado y acciones según el estado
 * (+ registrar si fue atendido, que corrige el cierre automático de HU-25,
 * y la fórmula médica de una cita atendida).
 */

const RESULTADOS_LLAMADA = [
  ["contesto", "Contestó"],
  ["no_contesto", "No contestó"],
  ["numero_equivocado", "Número equivocado"],
  ["buzon_de_voz", "Buzón de voz"],
];

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

function Volver() {
  return (
    <Link className="admin-volver" to="/admin/citas">
      <span className="admin-volver__circulo">
        <Chevron hacia="izquierda" tamano={14} />
      </span>
      Volver a Gestión de citas
    </Link>
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

  // Ejecuta una acción; la respuesta ya trae el detalle actualizado (HU-43). Devuelve si salió bien.
  async function ejecutar(accion, textoExito) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      const actualizada = await accion();
      setCita(actualizada);
      setPanel(null);
      setAviso(textoExito);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
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
        <Volver />
        {error ? <div className="alert alert--error">{error}</div> : <p className="texto-suave">Cargando la cita…</p>}
      </>
    );
  }

  const a = cita.acciones;
  const hayAcciones = a.confirmar || a.recordatorio || a.contactar || a.reprogramar || a.cancelar || a.registrar_resultado;
  const p = cita.paciente;

  return (
    <>
      <Volver />

      <div className="admin-detalle__encabezado">
        <div>
          <h1 className="admin-titulo">{p.nombre}</h1>
          <p className="admin-subtitulo">
            {cita.especialidad} · {cita.especialista} · {formatearFechaLarga(cita.fecha)}, {formatearHora(cita.hora)} ·{" "}
            {cita.sede}, {cita.modalidad}
          </p>
        </div>
        <div className="admin-detalle__estado">
          <EstadoBadge cita={cita} />
          <span className="admin-comprobante">{cita.numero_comprobante}</span>
        </div>
      </div>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="admin-detalle">
        <div className="admin-detalle__columna">
          <section className="card">
            <h2 className="admin-card__titulo">Datos del paciente</h2>
            <Fila etiqueta="Documento">
              {SIGLA_DOCUMENTO[p.tipo_documento] ?? p.tipo_documento} {p.numero_documento}
            </Fila>
            <Fila etiqueta="Teléfono (WhatsApp)">{p.telefono_whatsapp}</Fila>
            <Fila etiqueta="Correo electrónico">{p.correo ?? "—"}</Fila>
            <Fila etiqueta="EPS">{epsDelPaciente(p)}</Fila>
            <Fila etiqueta="Estado de afiliación">{AFILIACION[p.estado_afiliacion] ?? p.estado_afiliacion}</Fila>
            {/* HU-42: el canal que eligió el paciente, referencia para contactarlo */}
            <Fila etiqueta="Canal preferido">{CANALES[cita.canal_recordatorio]}</Fila>
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Historial de asistencia</h2>
            <div className="cifras">
              <Cifra nombre="Atendidas" valor={cita.resumen_asistencia.atendidas} />
              <Cifra
                nombre="Inasistencias"
                valor={cita.resumen_asistencia.no_asistio}
                tono={cita.resumen_asistencia.no_asistio ? "peligro" : undefined}
              />
              <Cifra nombre="Canceladas" valor={cita.resumen_asistencia.canceladas} />
              <Cifra nombre="Reprogramadas" valor={cita.resumen_asistencia.reprogramadas} />
            </div>
            <TablaHistorial
              citas={cita.historial_asistencia}
              actualId={cita.id}
              vacio="Es la única cita de este paciente."
            />
          </section>

          <section className="card">
            <h2 className="admin-card__titulo">Trazabilidad de la cita</h2>
            <ListaRegistros registros={cita.auditoria} vacio="Sin registros." />
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

        </div>

        <div className="admin-detalle__columna">
          {cita.riesgo && (
            <section className="card riesgo-card">
              <h2 className="admin-card__titulo">Riesgo estimado de inasistencia</h2>
              <IndicadorRiesgo riesgo={cita.riesgo} grande />
              <div>
                <p className="riesgo-card__subtitulo">Factores considerados</p>
                <ul className="factores">
                  {cita.riesgo.factores.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              <p className="texto-suave">
                Estimación basada en reglas. No constituye un diagnóstico ni una decisión; es un criterio de
                acompañamiento y no debe utilizarse para negar la atención.
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
                    Registrar llamada
                  </button>
                )}
                {a.reprogramar && (
                  <button className="btn btn--outline" onClick={() => setPanel("reprogramar")}>
                    Reprogramar
                  </button>
                )}
                {a.registrar_resultado && (
                  <button className="btn btn--outline" onClick={() => setPanel("resultado")}>
                    Registrar atención
                  </button>
                )}
                {a.cancelar && (
                  <>
                    <span className="acciones__separador" aria-hidden="true" />
                    <button className="btn btn--peligro-outline" onClick={() => setPanel("cancelar")}>
                      Cancelar cita
                    </button>
                  </>
                )}
              </div>
            )}

            {panel === "cancelar" && (
              <div className="panel-admin panel-admin--peligro">
                <p>
                  <strong>¿Cancelar la cita de {p.nombre}?</strong> El horario quedará libre para otro paciente y se le
                  avisará por {CANALES[cita.canal_recordatorio]}.
                </p>
                <div className="field">
                  <label htmlFor="motivo">Motivo <span className="opcional">(opcional)</span></label>
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
                  <button className="btn btn--outline btn--texto-peligro" onClick={() => setPanel(null)}>
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

          {/* HU-37: la llamada se registra en su propia tarjeta, debajo de "Acciones" */}
          {panel === "llamada" && (
            <section className="card" aria-labelledby="titulo-registrar-llamada">
              <h2 className="admin-card__titulo" id="titulo-registrar-llamada">
                Registrar llamada
              </h2>
              <p className="registrar-llamada__telefono">
                Teléfono: <strong>{p.telefono_whatsapp}</strong>
                <a className="btn btn--outline btn--compacto" href={`tel:${p.telefono_whatsapp}`}>
                  Llamar ahora
                </a>
              </p>
              <div className="campos-admin">
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
                  <label htmlFor="nota_llamada">Nota <span className="opcional">(opcional)</span></label>
                  <input
                    id="nota_llamada"
                    value={llamada.nota}
                    maxLength={500}
                    placeholder="Ej. Confirma asistencia"
                    onChange={(e) => setLlamada({ ...llamada, nota: e.target.value })}
                  />
                </div>
              </div>
              <div className="acciones-admin">
                <button
                  className="btn btn--primary"
                  disabled={ocupado}
                  onClick={() =>
                    ejecutar(() => registrarContactoAdmin(cita.id, llamada.resultado, llamada.nota), "Llamada registrada.")
                  }
                >
                  Guardar registro
                </button>
                <button className="btn btn--outline btn--texto-peligro" onClick={() => setPanel(null)}>
                  No, volver
                </button>
              </div>
            </section>
          )}

          {panel === "reprogramar" && (
            <SelectorNuevoHorario
              especialidadId={cita.especialidad_id}
              paraEps={p.eps_id}
              especialidadNombre={cita.especialidad}
              fechaActual={cita.fecha}
              horaActual={cita.hora}
              ocupado={ocupado}
              onConfirmar={reprogramar}
              onVolver={() => setPanel(null)}
            />
          )}

          {/* El diagnóstico y la fórmula están en la historia clínica (acceso restringido). */}
          {cita.estado_visible === "atendida" && (
            <section className="card" aria-labelledby="titulo-historia-cita">
              <h2 className="admin-card__titulo titulo-reservado" id="titulo-historia-cita">
                <IconoCandado tamano={15} />
                Historia clínica
              </h2>
              <p className="texto-suave">
                El diagnóstico y la fórmula médica de esta cita son información reservada: solo los ven los médicos
                tratantes y Coordinación médica, y cada consulta queda registrada en Auditoría.
              </p>
              <div className="acciones-admin">
                <Link to={`/admin/historia-clinica/${cita.id}`} className="btn btn--outline">
                  Ver diagnóstico y fórmula
                </Link>
              </div>
            </section>
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
                    placeholder="Agregar una observación sobre el paciente o la cita"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                  />
                </div>
                <button className="btn btn--primary btn--compacto" type="submit" disabled={ocupado || !observacion.trim()}>
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
