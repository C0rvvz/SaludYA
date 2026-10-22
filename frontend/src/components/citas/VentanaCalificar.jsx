import { useState } from "react";
import Ventana from "../Ventana";
import FotoProfesional from "../agendar/FotoProfesional";
import { CALIFICACIONES } from "../../utils/citas";

/** HU-71: calificar de 1 a 5 estrellas la atención de una cita atendida. */
export default function VentanaCalificar({ cita, ocupado, error, onEnviar, onCerrar }) {
  const [calificacion, setCalificacion] = useState(0);
  const [resaltada, setResaltada] = useState(0);
  const [comentario, setComentario] = useState("");
  const visible = resaltada || calificacion;
  const dia = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
    .format(new Date(`${cita.fecha}T00:00:00`))
    .replace(".", "");

  return (
    <Ventana
      titulo="¿Cómo fue su atención?"
      ocupado={ocupado}
      onCerrar={onCerrar}
      encabezado={
        <div className="ventana__quien">
          <FotoProfesional nombre={cita.especialista.nombre} tamano={56} />
          <div>
            <p className="ventana__quien-cuando">
              {cita.especialista.especialidad.nombre} · {dia}
            </p>
            <p className="ventana__quien-nombre">{cita.especialista.nombre}</p>
          </div>
        </div>
      }
    >
      <p className="ventana__texto">Su opinión nos ayuda a mejorar el servicio.</p>

      <fieldset className="estrellas-ventana" onMouseLeave={() => setResaltada(0)}>
        <legend className="sr-only">Califique de 1 a 5 estrellas</legend>
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
        {visible > 0 && <span className="estrellas-ventana__texto">{CALIFICACIONES[visible]}</span>}
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

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      <div className="ventana__acciones">
        <button
          type="button"
          className="btn btn--primary"
          disabled={ocupado || !calificacion}
          onClick={() => onEnviar(calificacion, comentario.trim())}
        >
          {ocupado ? "Enviando…" : "Enviar calificación"}
        </button>
        <button type="button" className="btn btn--outline" disabled={ocupado} onClick={onCerrar}>
          Ahora no
        </button>
      </div>
    </Ventana>
  );
}
