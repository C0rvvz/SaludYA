import { Link } from "react-router-dom";
import { confirmarAsistencia, registrarLlegada } from "../../api/citas";
import { ESTADOS_REAGENDABLES } from "../../utils/citas";
import { capitalizar, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { BloqueFecha, EstadoBadge } from "./ElementosCita";

/**
 * Una cita en la lista de "Mis citas".
 *
 * HU-30, criterio 1: muestra las opciones disponibles para ESA cita sin
 * tener que abrir el detalle: la acción del momento (registrar llegada o
 * confirmar asistencia), "Reprogramar" y "Cancelar" (criterios 2 y 3:
 * abren directamente ese paso) o, si ya pasó o se canceló, "Agendar de
 * nuevo" con la misma especialidad, sin empezar la búsqueda desde cero.
 */
export default function ItemCita({ cita: c, procesando, onAbrir, onAccionRapida }) {
  const especialidad = c.especialista.especialidad.nombre;
  const cuando = `${formatearFechaLarga(c.fecha)}, ${formatearHora(c.hora)}`;

  return (
    <div className="cita-item">
      <button
        type="button"
        className="cita-item__principal"
        onClick={() => onAbrir("ver")}
        aria-label={`Ver detalle: ${especialidad}, ${cuando} (${c.estado_texto})`}
      >
        <BloqueFecha fecha={c.fecha} />
        <span className="cita-item__info">
          <strong>{especialidad}</strong>
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

      <div className="cita-item__acciones">
        {c.puede_registrar_llegada ? (
          <button
            type="button"
            className="btn btn--primary btn--compacto"
            disabled={procesando}
            onClick={() =>
              onAccionRapida(registrarLlegada, `Listo. Registramos su llegada a ${especialidad}. Espere su turno.`)
            }
          >
            {procesando ? "Registrando..." : "Registrar mi llegada"}
          </button>
        ) : (
          c.puede_confirmar_asistencia && (
            <button
              type="button"
              className="btn btn--success btn--compacto"
              disabled={procesando}
              onClick={() =>
                onAccionRapida(
                  confirmarAsistencia,
                  `Listo. Confirmó su asistencia a ${especialidad} el ${formatearFechaLarga(c.fecha).toLowerCase()}.`
                )
              }
            >
              {procesando ? "Confirmando..." : "Confirmar asistencia"}
            </button>
          )
        )}
        {c.puede_reprogramar && (
          <button
            type="button"
            className="btn btn--outline btn--compacto"
            onClick={() => onAbrir("reprogramar")}
            aria-label={`Reprogramar la cita de ${especialidad} del ${cuando}`}
          >
            Reprogramar
          </button>
        )}
        {c.puede_cancelar && (
          <button
            type="button"
            className="btn btn--peligro-outline btn--compacto"
            onClick={() => onAbrir("cancelar")}
            aria-label={`Cancelar la cita de ${especialidad} del ${cuando}`}
          >
            Cancelar
          </button>
        )}
        {ESTADOS_REAGENDABLES.includes(c.estado_visible) && (
          <Link
            to={`/panel?especialidad=${c.especialista.especialidad.id}`}
            className="btn btn--outline btn--compacto"
            aria-label={`Agendar de nuevo una cita de ${especialidad}`}
          >
            Agendar de nuevo
          </Link>
        )}
      </div>
    </div>
  );
}
