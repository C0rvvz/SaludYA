import { useState } from "react";
import Ventana from "../Ventana";
import { formatearFechaLarga, formatearHora } from "../../utils/formato";

const MOTIVOS = ["No puedo asistir", "Ya no necesito la cita", "Conseguí otra cita", "Otro motivo"];

/** HU-21: cancelar una cita, con confirmación y motivo opcional. */
export default function VentanaCancelar({ cita, ocupado, error, onConfirmar, onCerrar }) {
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const motivoFinal = motivo === "Otro motivo" ? otro.trim() : motivo;

  return (
    <Ventana titulo="¿Desea cancelar esta cita?" ocupado={ocupado} onCerrar={onCerrar}>
      <p className="ventana__texto">
        {cita.especialista.especialidad.nombre} · {formatearFechaLarga(cita.fecha)}, {formatearHora(cita.hora)}
        <br />
        El horario quedará libre para otro paciente.
      </p>

      <fieldset className="opciones-ventana">
        <legend>Motivo <span className="opcional">(opcional)</span></legend>
        <div className="opciones-ventana__lista">
          {MOTIVOS.map((m) => (
            <label key={m} className="opcion-radio">
              <input
                type="radio"
                name="motivo_cancelacion"
                value={m}
                checked={motivo === m}
                onChange={() => setMotivo(m)}
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>
      {motivo === "Otro motivo" && (
        <div className="field">
          <label htmlFor="motivo_otro">Cuéntenos el motivo</label>
          <input id="motivo_otro" value={otro} onChange={(e) => setOtro(e.target.value)} maxLength={300} />
        </div>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      <div className="ventana__acciones">
        <button type="button" className="btn btn--peligro" disabled={ocupado} onClick={() => onConfirmar(motivoFinal)}>
          {ocupado ? "Cancelando…" : "Sí, cancelar la cita"}
        </button>
        <button type="button" className="btn btn--outline btn--texto-peligro" disabled={ocupado} onClick={onCerrar}>
          No, volver
        </button>
      </div>
    </Ventana>
  );
}
