import FotoProfesional from "../agendar/FotoProfesional";
import { Chevron } from "../Iconos";
import { CALIFICACIONES, CANALES, estrellas, horaDe } from "../../utils/citas";
import { capitalizar, formatearFechaLarga, formatearHora, formatearSoloHora } from "../../utils/formato";
import AccionesCita from "./AccionesCita";
import { EstadoBadge, Fila } from "./ElementosCita";
import FormulaCita from "./FormulaCita";

// "15 oct · 10:42 a. m."
function cuandoPaso(fechaHoraIso) {
  const dia = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(fechaHoraIso));
  return `${dia.replace(".", "")} · ${formatearSoloHora(fechaHoraIso)}`;
}

/**
 * Detalle de una cita — HU-26 criterio 4, HU-27 criterio 3 y HU-18 (su
 * estado y la línea de tiempo, con "Ver si hay novedades" para volver a
 * consultarlo). Las acciones las resuelve "Mis citas" (`onAccion`).
 * Si el médico ya mandó la fórmula, debajo va la fórmula y dónde reclamarla.
 */
export default function DetalleCita({ cita, ocupado, actualizando, onAccion, onActualizar, onAbrirNumero, onVolver }) {
  const especialidad = cita.especialista.especialidad.nombre;
  const historial = cita.historial ?? [];

  return (
    <div className="detalle-mi-cita">
      <button type="button" className="btn-volver detalle-mi-cita__volver" onClick={onVolver}>
        <span className="btn__circulo">
          <Chevron hacia="izquierda" />
        </span>
        Volver a mis citas
      </button>

      <section className="card detalle-mi-cita__tarjeta" aria-labelledby="titulo-detalle-cita">
        <div className="detalle-mi-cita__cabeza">
          <EstadoBadge cita={cita} corto />
          <span className="detalle-mi-cita__numero">{cita.numero_comprobante}</span>
        </div>
        <div className="detalle-mi-cita__quien">
          <FotoProfesional nombre={cita.especialista.nombre} tamano={60} />
          <div>
            <h2 id="titulo-detalle-cita">{especialidad}</h2>
            <p>{cita.especialista.nombre}</p>
          </div>
        </div>

        <div className="detalle-mi-cita__datos">
          <div>
            <Fila etiqueta="Fecha">{formatearFechaLarga(cita.fecha)}</Fila>
            <Fila etiqueta="Hora">{formatearHora(cita.hora)}</Fila>
          </div>
          <div>
            <Fila etiqueta="Sede">
              {cita.sede.nombre} · {cita.sede.ciudad}
              {cita.sede.direccion && <span className="detalle-mi-cita__direccion">{cita.sede.direccion}</span>}
            </Fila>
            <Fila etiqueta="Modalidad">{capitalizar(cita.modalidad)}</Fila>
          </div>
        </div>
        <div>
          <Fila etiqueta="Recordatorio por">{CANALES[cita.canal_recordatorio] ?? cita.canal_recordatorio}</Fila>
          {cita.motivo_cancelacion && <Fila etiqueta="Motivo de cancelación">{cita.motivo_cancelacion}</Fila>}
          {cita.calificacion && (
            <Fila etiqueta="Su calificación">
              <span className="estrellas-fijas" aria-hidden="true">
                {estrellas(cita.calificacion)}
              </span>{" "}
              {cita.calificacion} de 5 · {CALIFICACIONES[cita.calificacion]}
            </Fila>
          )}
          {cita.comentario_calificacion && <Fila etiqueta="Su comentario">{cita.comentario_calificacion}</Fila>}
          {cita.reprogramada_desde && (
            <Fila etiqueta="Viene de la cita">
              <button type="button" className="btn--link" onClick={() => onAbrirNumero(cita.reprogramada_desde)}>
                {cita.reprogramada_desde}
              </button>
            </Fila>
          )}
          {cita.reprogramada_a && (
            <Fila etiqueta="Se cambió a la cita">
              <button type="button" className="btn--link" onClick={() => onAbrirNumero(cita.reprogramada_a)}>
                {cita.reprogramada_a}
              </button>
            </Fila>
          )}
        </div>

        {/* HU-24, criterio 2: los datos de la cita a la mano al llegar a la sede. */}
        {cita.estado_visible === "llegada_registrada" && (
          <div className="alert alert--success">
            Ya registró su llegada. Espere su turno. Si se lo piden en recepción, muestre este número:{" "}
            <strong>{cita.numero_comprobante}</strong>
          </div>
        )}
        {cita.llegada_disponible_desde && !cita.puede_registrar_llegada && (
          <p className="detalle-mi-cita__nota">
            {/* Sin punto final: la hora ya termina en "a. m." / "p. m." */}
            El día de su cita podrá registrar su llegada desde las {horaDe(cita.llegada_disponible_desde)}
          </p>
        )}

        <AccionesCita cita={cita} ocupado={ocupado} onAccion={onAccion} />
      </section>

      {cita.tiene_formula && <FormulaCita key={cita.id} citaId={cita.id} />}

      <section className="card estado-cita" aria-labelledby="titulo-estado-cita">
        <div className="estado-cita__cabeza">
          <h3 id="titulo-estado-cita">Estado de su cita</h3>
          <button type="button" className="boton-novedades" disabled={actualizando} onClick={onActualizar}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path
                d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {actualizando ? "Consultando…" : "Ver si hay novedades"}
          </button>
        </div>
        <ol className="estado-cita__linea">
          {historial.map((evento, i) => (
            <li key={`${evento.tipo}-${evento.fecha}`} className={i === historial.length - 1 ? "is-actual" : ""}>
              <span className="estado-cita__punto" aria-hidden="true" />
              <div>
                <p className="estado-cita__cuando">{cuandoPaso(evento.fecha)}</p>
                <p className="estado-cita__que">{evento.descripcion}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
