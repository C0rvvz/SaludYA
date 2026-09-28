import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AsistenteChat from "../components/AsistenteChat";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import { buscarDisponibilidad } from "../api/catalogo";
import {
  cancelarCita,
  confirmarAsistencia,
  listarMisCitas,
  obtenerMiCita,
  reprogramarCita,
} from "../api/citas";
import {
  capitalizar,
  formatearDiaChip,
  formatearFechaHora,
  formatearFechaLarga,
  formatearHora,
  formatearMesCorto,
} from "../utils/formato";

/**
 * "Mis citas" — Bloque 5: gestionar la cita mientras llega la fecha.
 *
 * HU-26: apartado "Mis citas", citas organizadas por estado (pestañas)
 *        y detalle al seleccionar una.
 * HU-27: próximas citas con fecha, hora, sede y modalidad, y acciones.
 * HU-29: citas pendientes de confirmar asistencia, con botón directo.
 * HU-18: estado claro de cada cita y su línea de tiempo.
 * HU-20: reprogramar (elegir un nuevo horario de la misma especialidad).
 * HU-21: cancelar, con confirmación y motivo opcional.
 */

const CANALES = {
  whatsapp: "WhatsApp",
  sms: "Mensaje de texto",
  correo: "Correo electrónico",
  llamada: "Llamada",
};

const CLASE_ESTADO = {
  pendiente_confirmar: "badge--warning",
  asistencia_confirmada: "badge--success",
  finalizada: "badge--neutral",
  cancelada: "badge--error",
  reprogramada: "badge--neutral",
};

const ACTIVAS = ["pendiente_confirmar", "asistencia_confirmada"];

const PESTANAS = [
  {
    id: "por_confirmar",
    titulo: "Por confirmar",
    vacio: "No tiene citas pendientes de confirmar.",
    filtro: (c) => c.estado_visible === "pendiente_confirmar",
  },
  {
    id: "proximas",
    titulo: "Próximas",
    vacio: "No tiene citas próximas.",
    filtro: (c) => ACTIVAS.includes(c.estado_visible),
  },
  {
    id: "historial",
    titulo: "Historial",
    vacio: "Todavía no tiene citas pasadas, canceladas ni reprogramadas.",
    filtro: (c) => !ACTIVAS.includes(c.estado_visible),
  },
];

const MOTIVOS = ["No puedo asistir", "Ya no necesito la cita", "Conseguí otra cita", "Otro motivo"];

function EstadoBadge({ cita }) {
  return <span className={`badge ${CLASE_ESTADO[cita.estado_visible]}`}>{cita.estado_texto}</span>;
}

function BloqueFecha({ fecha }) {
  const { dia, numero } = formatearDiaChip(fecha);
  return (
    <span className="bloque-fecha" aria-hidden="true">
      <span>{dia}</span>
      <strong>{numero}</strong>
      <span>{formatearMesCorto(fecha)}</span>
    </span>
  );
}

function Fila({ etiqueta, children }) {
  return (
    <div className="summary-row">
      <span className="summary-row__label">{etiqueta}</span>
      <span className="summary-row__value">{children}</span>
    </div>
  );
}

// --- HU-21: cancelar, con confirmación y motivo opcional ---
function PanelCancelar({ cita, ocupado, onConfirmar, onVolver }) {
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const motivoFinal = motivo === "Otro motivo" ? otro.trim() : motivo;

  return (
    <div className="card panel-accion panel-accion--peligro">
      <h2>¿Desea cancelar esta cita?</h2>
      <p style={{ marginBottom: "0.25rem" }}>
        {cita.especialista.especialidad.nombre} · {formatearFechaLarga(cita.fecha)},{" "}
        {formatearHora(cita.hora)}
      </p>
      <p>El horario quedará libre para otro paciente.</p>

      <p style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Motivo (opcional)</p>
      <div className="channel-grid">
        {MOTIVOS.map((m) => (
          <label className="channel-card" key={m}>
            <input
              type="radio"
              name="motivo_cancelacion"
              value={m}
              checked={motivo === m}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {m}
          </label>
        ))}
      </div>
      {motivo === "Otro motivo" && (
        <div className="field">
          <label htmlFor="motivo_otro">Cuéntenos el motivo</label>
          <input
            id="motivo_otro"
            value={otro}
            onChange={(e) => setOtro(e.target.value)}
            maxLength={300}
          />
        </div>
      )}

      <div className="acciones-cita">
        <button className="btn btn--peligro" disabled={ocupado} onClick={() => onConfirmar(motivoFinal)}>
          {ocupado ? "Cancelando..." : "Sí, cancelar la cita"}
        </button>
        <button className="btn btn--outline" disabled={ocupado} onClick={onVolver}>
          No, volver
        </button>
      </div>
    </div>
  );
}

// --- HU-20: reprogramar a otro horario de la misma especialidad ---
function PanelReprogramar({ cita, ocupado, onConfirmar, onVolver }) {
  const [franjas, setFranjas] = useState(null);
  const [error, setError] = useState("");
  const [dia, setDia] = useState(null);
  const [elegida, setElegida] = useState(null);
  const [revisando, setRevisando] = useState(false);

  useEffect(() => {
    buscarDisponibilidad({ especialidad_id: cita.especialista.especialidad.id })
      .then((lista) => {
        // La búsqueda solo trae horarios libres; además se quitan los de
        // hoy que ya pasaron.
        const ahora = new Date();
        const futuras = lista.filter((f) => new Date(`${f.fecha}T${f.hora}`) > ahora);
        setFranjas(futuras);
        setDia(futuras[0]?.fecha ?? null);
      })
      .catch((err) => setError(err.message));
  }, [cita.especialista.especialidad.id]);

  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const f of franjas ?? []) {
      if (!mapa.has(f.fecha)) mapa.set(f.fecha, []);
      mapa.get(f.fecha).push(f);
    }
    return mapa;
  }, [franjas]);

  if (error) return <div className="alert alert--error">{error}</div>;
  if (franjas === null) return <p>Buscando horarios disponibles...</p>;

  if (revisando && elegida) {
    return (
      <div className="card panel-accion">
        <h2>¿Confirma el cambio?</h2>
        <Fila etiqueta="Su cita actual">
          {formatearFechaLarga(cita.fecha)}, {formatearHora(cita.hora)}
        </Fila>
        <Fila etiqueta="Nueva fecha y hora">
          {formatearFechaLarga(elegida.fecha)}, {formatearHora(elegida.hora)}
        </Fila>
        <Fila etiqueta="Especialista">{elegida.especialista.nombre}</Fila>
        <Fila etiqueta="Sede">
          {elegida.sede.nombre} · {capitalizar(elegida.modalidad)}
        </Fila>
        <div className="acciones-cita">
          <button className="btn btn--success" disabled={ocupado} onClick={() => onConfirmar(elegida)}>
            {ocupado ? "Cambiando..." : "Sí, cambiar mi cita"}
          </button>
          <button className="btn btn--outline" disabled={ocupado} onClick={() => setRevisando(false)}>
            Elegir otro horario
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card panel-accion">
      <h2>Elija el nuevo horario</h2>
      {franjas.length === 0 ? (
        <p>
          No hay otros horarios disponibles de {cita.especialista.especialidad.nombre} en este
          momento.
        </p>
      ) : (
        <>
          <div className="day-picker">
            {Array.from(porDia.keys()).map((fecha) => {
              const { dia: nombreDia, numero } = formatearDiaChip(fecha);
              return (
                <button
                  key={fecha}
                  type="button"
                  className={`day-chip ${dia === fecha ? "is-selected" : ""}`}
                  onClick={() => {
                    setDia(fecha);
                    setElegida(null);
                  }}
                >
                  <span>{nombreDia}</span>
                  <span>{numero}</span>
                </button>
              );
            })}
          </div>
          <div className="time-grid">
            {(porDia.get(dia) ?? []).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`time-slot ${elegida?.id === f.id ? "is-selected" : ""}`}
                onClick={() => setElegida(f)}
              >
                <span className="time-slot__hora">{formatearHora(f.hora)}</span>
                <span className="time-slot__meta">
                  {f.especialista.nombre} · {f.sede.nombre} · {capitalizar(f.modalidad)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="acciones-cita">
        <button className="btn btn--primary" disabled={!elegida} onClick={() => setRevisando(true)}>
          Continuar
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </div>
  );
}

// --- HU-26 criterio 4 / HU-27 criterio 3 / HU-18: detalle de una cita ---
function DetalleCita({ citaId, avisoInicial, onVolver, onCambio, onAbrirNumero }) {
  const [cita, setCita] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(avisoInicial);
  const [modo, setModo] = useState("ver"); // ver | cancelar | reprogramar
  const [ocupado, setOcupado] = useState(false);

  // HU-18, criterio 3: se puede volver a consultar ("Actualizar estado").
  const cargar = useCallback(
    () =>
      obtenerMiCita(citaId)
        .then((datos) => {
          setCita(datos);
          setError("");
        })
        .catch((err) => setError(err.message)),
    [citaId]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(accion, textoExito) {
    setOcupado(true);
    setError("");
    setAviso("");
    try {
      const resultado = await accion();
      setModo("ver");
      onCambio();
      if (textoExito) setAviso(textoExito);
      return resultado;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    const actualizada = await ejecutar(
      () => confirmarAsistencia(citaId),
      "Listo. Su asistencia quedó confirmada. Gracias por avisarnos."
    );
    if (actualizada) setCita(actualizada);
  }

  async function cancelar(motivo) {
    const actualizada = await ejecutar(
      () => cancelarCita(citaId, motivo),
      "Su cita fue cancelada. El horario quedó libre para otro paciente."
    );
    if (actualizada) setCita(actualizada);
  }

  async function reprogramar(franja) {
    const nueva = await ejecutar(() => reprogramarCita(citaId, franja.id));
    if (nueva) {
      onAbrirNumero(
        nueva.numero_comprobante,
        `Su cita fue reprogramada. Este es su nuevo comprobante: ${nueva.numero_comprobante}.`,
        nueva.id
      );
    }
  }

  return (
    <>
      <button className="back-link" onClick={onVolver}>
        ← Volver a mis citas
      </button>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {!cita ? (
        !error && <p>Cargando su cita...</p>
      ) : (
        <div className="detalle-cita">
          <div className="card">
            <div className="comprobante-header">
              <EstadoBadge cita={cita} />
              <span className="comprobante-numero">{cita.numero_comprobante}</span>
            </div>
            <h1 style={{ fontSize: "var(--text-lg)", marginBottom: "0.25rem" }}>
              {cita.especialista.especialidad.nombre}
            </h1>
            <p>{cita.especialista.nombre}</p>

            <Fila etiqueta="Fecha">{formatearFechaLarga(cita.fecha)}</Fila>
            <Fila etiqueta="Hora">{formatearHora(cita.hora)}</Fila>
            <Fila etiqueta="Sede">
              {cita.sede.nombre} · {cita.sede.ciudad}
            </Fila>
            <Fila etiqueta="Modalidad">{capitalizar(cita.modalidad)}</Fila>
            <Fila etiqueta="Recordatorio por">
              {CANALES[cita.canal_recordatorio] ?? cita.canal_recordatorio}
            </Fila>
            {cita.motivo_cancelacion && (
              <Fila etiqueta="Motivo de cancelación">{cita.motivo_cancelacion}</Fila>
            )}
            {cita.reprogramada_desde && (
              <Fila etiqueta="Viene de la cita">
                <button className="btn--link" onClick={() => onAbrirNumero(cita.reprogramada_desde)}>
                  {cita.reprogramada_desde}
                </button>
              </Fila>
            )}
            {cita.reprogramada_a && (
              <Fila etiqueta="Se cambió a la cita">
                <button className="btn--link" onClick={() => onAbrirNumero(cita.reprogramada_a)}>
                  {cita.reprogramada_a}
                </button>
              </Fila>
            )}
          </div>

          {modo === "ver" &&
            (cita.puede_confirmar_asistencia || cita.puede_reprogramar || cita.puede_cancelar) && (
              <div className="acciones-cita">
                {cita.puede_confirmar_asistencia && (
                  <button className="btn btn--success" disabled={ocupado} onClick={confirmar}>
                    {ocupado ? "Confirmando..." : "Confirmar asistencia"}
                  </button>
                )}
                {cita.puede_reprogramar && (
                  <button className="btn btn--outline" disabled={ocupado} onClick={() => setModo("reprogramar")}>
                    Reprogramar
                  </button>
                )}
                {cita.puede_cancelar && (
                  <button className="btn btn--peligro-outline" disabled={ocupado} onClick={() => setModo("cancelar")}>
                    Cancelar cita
                  </button>
                )}
              </div>
            )}

          {modo === "cancelar" && (
            <PanelCancelar cita={cita} ocupado={ocupado} onConfirmar={cancelar} onVolver={() => setModo("ver")} />
          )}
          {modo === "reprogramar" && (
            <PanelReprogramar
              cita={cita}
              ocupado={ocupado}
              onConfirmar={reprogramar}
              onVolver={() => setModo("ver")}
            />
          )}

          <div className="card">
            <h2 style={{ fontSize: "var(--text-md)" }}>Estado de su cita</h2>
            <ol className="linea-tiempo">
              {cita.historial.map((evento, i) => (
                <li key={i} className={i === cita.historial.length - 1 ? "is-actual" : ""}>
                  <span className="linea-tiempo__fecha">{formatearFechaHora(evento.fecha)}</span>
                  <span>{evento.descripcion}</span>
                </li>
              ))}
            </ol>
            <button className="btn--link" onClick={cargar}>
              Actualizar estado
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function MisCitasPage() {
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState(null);
  const [seleccion, setSeleccion] = useState(null); // { id, aviso }
  const [aviso, setAviso] = useState(null); // { tipo, texto }
  const [confirmandoId, setConfirmandoId] = useState(null);

  const cargar = useCallback(
    () =>
      listarMisCitas()
        .then((datos) => {
          setCitas(datos);
          setError("");
          // Al entrar, si hay algo por confirmar se muestra primero (HU-29).
          setPestana(
            (actual) =>
              actual ??
              (datos.some((c) => c.estado_visible === "pendiente_confirmar") ? "por_confirmar" : "proximas")
          );
        })
        .catch((err) => setError(err.message))
        .finally(() => setCargando(false)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const conteos = useMemo(
    () => Object.fromEntries(PESTANAS.map((p) => [p.id, citas.filter(p.filtro).length])),
    [citas]
  );
  const actual = PESTANAS.find((p) => p.id === pestana) ?? PESTANAS[1];
  let visibles = citas.filter(actual.filtro);
  if (actual.id === "historial") visibles = [...visibles].reverse(); // lo más reciente primero

  async function confirmarDesdeLista(cita) {
    setConfirmandoId(cita.id);
    setAviso(null);
    try {
      await confirmarAsistencia(cita.id);
      setAviso({
        tipo: "success",
        texto: `Listo. Confirmó su asistencia a ${cita.especialista.especialidad.nombre} el ${formatearFechaLarga(
          cita.fecha
        ).toLowerCase()}.`,
      });
      await cargar();
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setConfirmandoId(null);
    }
  }

  function abrirPorNumero(numero, avisoTexto, idConocido) {
    const id = idConocido ?? citas.find((c) => c.numero_comprobante === numero)?.id;
    if (id) setSeleccion({ id, aviso: avisoTexto ?? "" });
  }

  return (
    <div>
      <EncabezadoPaciente />

      <div className="section mis-citas">
        {seleccion ? (
          <DetalleCita
            key={seleccion.id}
            citaId={seleccion.id}
            avisoInicial={seleccion.aviso}
            onVolver={() => {
              setSeleccion(null);
              cargar();
            }}
            onCambio={cargar}
            onAbrirNumero={abrirPorNumero}
          />
        ) : (
          <>
            <h1 style={{ fontSize: "var(--text-xl)" }}>Mis citas</h1>
            <p>Consulte sus citas, confirme que asistirá, cámbielas o cancélelas.</p>

            {aviso && <div className={`alert alert--${aviso.tipo}`}>{aviso.texto}</div>}
            {error && <div className="alert alert--error">{error}</div>}

            <div className="pestanas-citas" role="tablist" aria-label="Organizar citas por estado">
              {PESTANAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={actual.id === p.id}
                  className={`pestana-cita ${actual.id === p.id ? "is-active" : ""}`}
                  onClick={() => setPestana(p.id)}
                >
                  {p.titulo} <span className="pestana-cita__conteo">{conteos[p.id]}</span>
                </button>
              ))}
            </div>

            {actual.id === "por_confirmar" && visibles.length > 0 && (
              <p className="field__hint">
                Confirme que asistirá: así podemos ofrecer a otra persona los horarios que no se van a usar.
              </p>
            )}

            {cargando ? (
              <p>Cargando sus citas...</p>
            ) : visibles.length === 0 ? (
              <div className="empty-state">
                <p>{actual.vacio}</p>
                <Link to="/panel" className="btn btn--primary">
                  Agendar una cita
                </Link>
              </div>
            ) : (
              <div className="lista-citas">
                {visibles.map((c) => (
                  <div className="cita-item" key={c.id}>
                    <button
                      type="button"
                      className="cita-item__principal"
                      onClick={() => {
                        setAviso(null);
                        setSeleccion({ id: c.id, aviso: "" });
                      }}
                      aria-label={`Ver detalle: ${c.especialista.especialidad.nombre}, ${formatearFechaLarga(
                        c.fecha
                      )}, ${formatearHora(c.hora)} (${c.estado_texto})`}
                    >
                      <BloqueFecha fecha={c.fecha} />
                      <span className="cita-item__info">
                        <strong>{c.especialista.especialidad.nombre}</strong>
                        <span>
                          {formatearHora(c.hora)} · {c.especialista.nombre}
                        </span>
                        <span>
                          {c.sede.nombre} · {capitalizar(c.modalidad)}
                        </span>
                        <EstadoBadge cita={c} />
                      </span>
                      <span className="cita-item__ver">Ver detalle ›</span>
                    </button>
                    {c.puede_confirmar_asistencia && (
                      <button
                        type="button"
                        className="btn btn--success cita-item__confirmar"
                        disabled={confirmandoId === c.id}
                        onClick={() => confirmarDesdeLista(c)}
                      >
                        {confirmandoId === c.id ? "Confirmando..." : "Confirmar asistencia"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* El asistente también puede gestionar las citas: al terminar una acción, la lista se actualiza. */}
      <AsistenteChat onCambioCitas={cargar} />
    </div>
  );
}
