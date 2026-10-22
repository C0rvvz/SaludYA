import FotoProfesional from "../agendar/FotoProfesional";
import { ESTADO_CORTO } from "../../utils/citas";
import { capitalizar, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { cuandoEs, nombreCorto } from "../../utils/agendar";
import AccionesCita from "./AccionesCita";
import { BloqueFecha, EstadoBadge } from "./ElementosCita";

/**
 * Una cita en la lista de "Mis citas" (HU-26, HU-27).
 *
 * Computador: bloque de fecha, especialidad, hora y médico, y el estado;
 * al tocarla se abre su detalle al lado (con todas las acciones).
 * Celular: "LUN 3 NOV · 2:30 P. M.", foto del médico y, debajo, las
 * acciones de esa cita sin abrir el detalle (HU-30, criterio 1).
 */
export default function TarjetaCita({ cita: c, elegida, ocultaEnMovil, ocupado, onVer, onAccion }) {
  const especialidad = c.especialista.especialidad.nombre;
  return (
    <article className={`tarjeta-cita ${elegida ? "is-elegida" : ""} ${ocultaEnMovil ? "tarjeta-cita--oculta-movil" : ""}`}>
      <button
        type="button"
        className="tarjeta-cita__principal"
        aria-current={elegida || undefined}
        aria-label={`Ver detalle: ${especialidad}, ${formatearFechaLarga(c.fecha)}, ${formatearHora(c.hora)} (${ESTADO_CORTO[c.estado_visible] ?? c.estado_texto})`}
        onClick={onVer}
      >
        <BloqueFecha fecha={c.fecha} elegida={elegida} />
        <span className="tarjeta-cita__cuerpo">
          <span className="tarjeta-cita__cuando">
            <span>{cuandoEs(c.fecha)} ·</span> <span>{formatearHora(c.hora)}</span>
          </span>
          <span className="tarjeta-cita__fila">
            <span className="tarjeta-cita__foto">
              <FotoProfesional nombre={c.especialista.nombre} tamano={44} />
            </span>
            <span className="tarjeta-cita__textos">
              <span className="tarjeta-cita__especialidad">{especialidad}</span>
              <span className="tarjeta-cita__meta tarjeta-cita__meta--computador">
                {formatearHora(c.hora)} · {nombreCorto(c.especialista.nombre)}
              </span>
              <span className="tarjeta-cita__meta tarjeta-cita__meta--movil">
                {c.especialista.nombre} · {capitalizar(c.modalidad)}
              </span>
            </span>
          </span>
        </span>
        <EstadoBadge cita={c} corto />
      </button>
      <AccionesCita cita={c} compacta ocupado={ocupado} onAccion={onAccion} />
    </article>
  );
}
