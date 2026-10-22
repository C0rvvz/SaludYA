import FotoProfesional from "../agendar/FotoProfesional";
import { enlaceComoLlegar } from "../../utils/citas";
import { formatearHora } from "../../utils/formato";
import { cuandoEs, nombreCorto } from "../../utils/agendar";
import { EstadoBadge } from "./ElementosCita";

/**
 * Celular: la próxima cita, destacada arriba de "Mis citas", con lo que
 * más se usa a la mano: "Ya llegué" el día de la cita (HU-24) o confirmar
 * la asistencia (HU-29), y "Cómo llegar" a la sede.
 */
export default function ProximaCita({ cita, ocupado, onAccion, onVer }) {
  const quien = `${cita.especialista.especialidad.nombre} · ${nombreCorto(cita.especialista.nombre)}`;

  let principal;
  if (cita.puede_registrar_llegada) {
    principal = (
      <button
        type="button"
        className="btn proxima-cita__boton"
        disabled={ocupado}
        aria-label="Ya llegué: registrar mi llegada a mi próxima cita"
        onClick={() => onAccion("llegada")}
      >
        {ocupado ? "Registrando…" : "Ya llegué"}
      </button>
    );
  } else if (cita.puede_confirmar_asistencia) {
    principal = (
      <button
        type="button"
        className="btn proxima-cita__boton"
        disabled={ocupado}
        aria-label="Confirmar mi asistencia a mi próxima cita"
        onClick={() => onAccion("confirmar")}
      >
        {ocupado ? "Confirmando…" : "Confirmar"}
      </button>
    );
  } else {
    principal = (
      <button type="button" className="btn proxima-cita__boton" onClick={onVer}>
        Ver detalle
      </button>
    );
  }

  return (
    <section className="proxima-cita" aria-labelledby="titulo-proxima-cita">
      <div className="proxima-cita__cabeza">
        <p id="titulo-proxima-cita" className="proxima-cita__rotulo">
          Próxima · {cuandoEs(cita.fecha)}
        </p>
        <EstadoBadge cita={cita} corto />
      </div>
      <div className="proxima-cita__fila">
        <div>
          <p className="proxima-cita__hora">{formatearHora(cita.hora)}</p>
          <p className="proxima-cita__quien">{quien}</p>
        </div>
        <FotoProfesional nombre={cita.especialista.nombre} tamano={56} />
      </div>
      <div className="proxima-cita__acciones">
        {principal}
        {cita.modalidad === "presencial" ? (
          <a
            className="btn proxima-cita__secundario"
            href={enlaceComoLlegar(cita.sede)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Cómo llegar
          </a>
        ) : (
          cita.puede_registrar_llegada || cita.puede_confirmar_asistencia ? (
            <button type="button" className="btn proxima-cita__secundario" onClick={onVer}>
              Ver detalle
            </button>
          ) : null
        )}
      </div>
    </section>
  );
}
