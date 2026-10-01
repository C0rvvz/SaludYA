import { useCallback, useEffect, useState } from "react";
import {
  calificarCita,
  cancelarCita,
  confirmarAsistencia,
  obtenerMiCita,
  registrarLlegada,
  reprogramarCita,
} from "../../api/citas";
import { CALIFICACIONES, CANALES, estrellas, horaDe } from "../../utils/citas";
import { capitalizar, formatearFechaHora, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { EstadoBadge, Fila } from "./ElementosCita";
import SelectorNuevoHorario from "./SelectorNuevoHorario";

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

// --- HU-71: calificar la atención de una cita atendida ---
function PanelCalificar({ ocupado, onEnviar }) {
  const [calificacion, setCalificacion] = useState(0);
  const [resaltada, setResaltada] = useState(0);
  const [comentario, setComentario] = useState("");
  const visible = resaltada || calificacion;

  return (
    <div className="card panel-accion">
      <h2>¿Cómo fue su atención?</h2>
      <p>Su opinión nos ayuda a mejorar el servicio.</p>

      <fieldset className="estrellas" onMouseLeave={() => setResaltada(0)}>
        <legend className="field__hint">Califique de 1 a 5 estrellas</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n}>
            <input
              type="radio"
              id={`calificacion_${n}`}
              name="calificacion"
              value={n}
              checked={calificacion === n}
              onChange={() => setCalificacion(n)}
            />
            <label
              htmlFor={`calificacion_${n}`}
              className={n <= visible ? "is-activa" : undefined}
              title={CALIFICACIONES[n]}
              onMouseEnter={() => setResaltada(n)}
            >
              ★<span className="sr-only">{`${n} de 5: ${CALIFICACIONES[n]}`}</span>
            </label>
          </span>
        ))}
        {visible > 0 && <span className="estrellas__texto">{CALIFICACIONES[visible]}</span>}
      </fieldset>

      <div className="field">
        <label htmlFor="comentario_calificacion">Comentario (opcional)</label>
        <textarea
          id="comentario_calificacion"
          rows={3}
          maxLength={500}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      </div>

      <div className="acciones-cita">
        <button
          className="btn btn--primary"
          disabled={ocupado || !calificacion}
          onClick={() => onEnviar(calificacion, comentario.trim())}
        >
          {ocupado ? "Enviando..." : "Enviar calificación"}
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

  async function calificar(calificacion, comentario) {
    const actualizada = await ejecutar(
      () => calificarCita(citaId, calificacion, comentario),
      "Gracias por calificar su atención."
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
            {cita.calificacion && (
              <Fila etiqueta="Su calificación">
                <span className="estrellas-fijas" aria-hidden="true">
                  {estrellas(cita.calificacion)}
                </span>{" "}
                {cita.calificacion} de 5 · {CALIFICACIONES[cita.calificacion]}
              </Fila>
            )}
            {cita.comentario_calificacion && (
              <Fila etiqueta="Su comentario">{cita.comentario_calificacion}</Fila>
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

          {modoVisible === "ver" && cita.puede_calificar && (
            <PanelCalificar ocupado={ocupado} onEnviar={calificar} />
          )}

          {modoVisible === "cancelar" && (
            <PanelCancelar cita={cita} ocupado={ocupado} onConfirmar={cancelar} onVolver={() => setModo("ver")} />
          )}
          {modoVisible === "reprogramar" && (
            <SelectorNuevoHorario
              especialidadId={cita.especialista.especialidad.id}
              especialidadNombre={cita.especialista.especialidad.nombre}
              fechaActual={cita.fecha}
              horaActual={cita.hora}
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
