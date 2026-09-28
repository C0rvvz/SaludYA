import { useCallback, useEffect, useMemo, useState } from "react";
import { buscarDisponibilidad } from "../../api/catalogo";
import {
  cancelarCita,
  confirmarAsistencia,
  obtenerMiCita,
  registrarLlegada,
  reprogramarCita,
} from "../../api/citas";
import { CANALES, horaDe } from "../../utils/citas";
import {
  capitalizar,
  formatearDiaChip,
  formatearFechaHora,
  formatearFechaLarga,
  formatearHora,
} from "../../utils/formato";
import { EstadoBadge, Fila } from "./ElementosCita";

const MOTIVOS = ["No puedo asistir", "Ya no necesito la cita", "Conseguí otra cita", "Otro motivo"];

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
        // La búsqueda ya trae solo horarios libres que todavía no empiezan.
        setFranjas(lista);
        setDia(lista[0]?.fecha ?? null);
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

/**
 * Detalle de una cita — HU-26 criterio 4, HU-27 criterio 3, HU-18
 * (estado y su línea de tiempo) y las acciones que correspondan.
 *
 * `modoInicial` ("cancelar" | "reprogramar") abre directamente ese paso
 * cuando el paciente lo eligió desde la lista (HU-30).
 */
export default function DetalleCita({
  citaId,
  avisoInicial,
  modoInicial = "ver",
  onVolver,
  onCambio,
  onAbrirNumero,
}) {
  const [cita, setCita] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(avisoInicial);
  const [modo, setModo] = useState(modoInicial); // ver | cancelar | reprogramar
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

  // HU-30, criterio 4: tras cada acción se actualiza el detalle y la lista.
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

  async function llegar() {
    const actualizada = await ejecutar(
      () => registrarLlegada(citaId),
      "Listo. Registramos su llegada. Espere su turno."
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

  // Si se pidió un paso que la cita ya no admite (p. ej. ya pasó), se
  // muestra la vista normal con las acciones que sí correspondan.
  const modoVisible =
    cita &&
    ((modo === "cancelar" && !cita.puede_cancelar) || (modo === "reprogramar" && !cita.puede_reprogramar))
      ? "ver"
      : modo;

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

          {/* HU-24, criterio 2: los datos de la cita a la mano al llegar a la sede. */}
          {cita.estado_visible === "llegada_registrada" && (
            <div className="alert alert--success aviso-llegada">
              Ya registró su llegada. Espere su turno.
              <br />
              Si se lo piden en recepción, muestre este número:{" "}
              <strong className="comprobante-numero">{cita.numero_comprobante}</strong>
            </div>
          )}

          {modoVisible === "ver" && cita.llegada_disponible_desde && !cita.puede_registrar_llegada && (
            <p className="field__hint">
              {/* Sin punto final: la hora ya termina en "a. m." / "p. m." */}
              El día de su cita podrá registrar su llegada desde las {horaDe(cita.llegada_disponible_desde)}
            </p>
          )}

          {modoVisible === "ver" &&
            (cita.puede_registrar_llegada ||
              cita.puede_confirmar_asistencia ||
              cita.puede_reprogramar ||
              cita.puede_cancelar) && (
              <div className="acciones-cita">
                {cita.puede_registrar_llegada && (
                  <button className="btn btn--primary" disabled={ocupado} onClick={llegar}>
                    {ocupado ? "Registrando..." : "Registrar mi llegada"}
                  </button>
                )}
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

          {modoVisible === "cancelar" && (
            <PanelCancelar cita={cita} ocupado={ocupado} onConfirmar={cancelar} onVolver={() => setModo("ver")} />
          )}
          {modoVisible === "reprogramar" && (
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
