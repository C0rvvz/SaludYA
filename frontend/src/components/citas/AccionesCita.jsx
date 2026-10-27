import { Link } from "react-router-dom";
import { ESTADOS_ACTIVOS, ESTADOS_REAGENDABLES, enlaceComoLlegar } from "../../utils/citas";
import { formatearFechaLarga, formatearHora } from "../../utils/formato";

/**
 * Lo que se puede hacer con una cita ahora (HU-27 criterio 4, HU-30),
 * según lo que dice el servidor (puede_confirmar_asistencia, puede_cancelar...).
 *
 * `compacta`: los botones cortos de la tarjeta en el celular ("Confirmar",
 * "Cambiar", "Cancelar"); su nombre accesible dice a qué cita se refieren.
 * Sin `compacta`: los del detalle, con el texto completo.
 *
 * Cancelar va siempre al final; en el detalle, pegado a la derecha si cabe
 * en la misma línea (ver .acciones__separador), como en el panel del personal.
 *
 * `onAccion(tipo)`: "llegada" | "confirmar" | "reprogramar" | "cancelar" | "calificar".
 */
export default function AccionesCita({ cita: c, compacta = false, ocupado = false, onAccion }) {
  const especialidad = c.especialista.especialidad.nombre;
  const cuando = `${formatearFechaLarga(c.fecha)}, ${formatearHora(c.hora)}`;

  // [tipo, texto en el detalle, texto en la tarjeta, nombre accesible en la tarjeta, clase]
  const posibles = [
    c.puede_registrar_llegada && [
      "llegada",
      ocupado ? "Registrando…" : "Ya llegué",
      ocupado ? "Registrando…" : "Ya llegué",
      `Registrar mi llegada a la cita de ${especialidad} del ${cuando}`,
      "btn--primary",
    ],
    !c.puede_registrar_llegada &&
      c.puede_confirmar_asistencia && [
        "confirmar",
        ocupado ? "Confirmando…" : "Confirmar asistencia",
        ocupado ? "Confirmando…" : "Confirmar",
        `Confirmar mi asistencia a la cita de ${especialidad} del ${cuando}`,
        "btn--primary",
      ],
    c.puede_reprogramar && [
      "reprogramar",
      "Reprogramar",
      "Cambiar",
      `Reprogramar la cita de ${especialidad} del ${cuando}`,
      "btn--outline",
    ],
    c.puede_cancelar && [
      "cancelar",
      "Cancelar cita",
      "Cancelar",
      `Cancelar la cita de ${especialidad} del ${cuando}`,
      "btn--peligro-outline",
    ],
    c.puede_calificar && [
      "calificar",
      "Calificar atención",
      "Calificar atención",
      `Calificar la atención de ${especialidad} del ${cuando}`,
      "btn--primary",
    ],
  ].filter(Boolean);

  const boton = ([tipo, texto, textoCorto, nombreAccesible, clase]) => (
    <button
      key={tipo}
      type="button"
      className={`btn ${clase}`}
      disabled={ocupado}
      aria-label={compacta ? nombreAccesible : undefined}
      onClick={() => onAccion(tipo)}
    >
      {compacta ? textoCorto : texto}
    </button>
  );
  const botones = posibles.filter(([tipo]) => tipo !== "cancelar").map(boton);
  const cancelar = posibles.find(([tipo]) => tipo === "cancelar");

  if (!compacta && ESTADOS_ACTIVOS.includes(c.estado_visible) && c.modalidad === "presencial") {
    botones.push(
      <a key="llegar" className="btn btn--outline" href={enlaceComoLlegar(c.sede)} target="_blank" rel="noopener noreferrer">
        Cómo llegar
      </a>
    );
  }
  if (ESTADOS_REAGENDABLES.includes(c.estado_visible)) {
    botones.push(
      <Link
        key="de-nuevo"
        to={`/panel?especialidad=${c.especialista.especialidad.id}`}
        className="btn btn--outline"
        aria-label={`Agendar de nuevo una cita de ${especialidad}`}
      >
        Agendar de nuevo
      </Link>
    );
  }

  if (cancelar) {
    if (!compacta) botones.push(<span key="separador" className="acciones__separador" aria-hidden="true" />);
    botones.push(boton(cancelar));
  }

  if (botones.length === 0) return null;
  return <div className={compacta ? "acciones-tarjeta-cita" : "acciones-detalle-cita"}>{botones}</div>;
}
