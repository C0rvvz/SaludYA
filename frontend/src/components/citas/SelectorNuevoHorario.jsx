import { useEffect, useState } from "react";
import { buscarDisponibilidad } from "../../api/catalogo";
import DiasYHoras from "../agendar/DiasYHoras";
import { capitalizar, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { Fila } from "./ElementosCita";

/**
 * Elegir el nuevo horario al reprogramar desde el panel del personal
 * (HU-39). Muestra los horarios libres de la misma especialidad, por día,
 * y pide confirmar el cambio antes de hacerlo.
 */
export default function SelectorNuevoHorario({
  especialidadId,
  especialidadNombre,
  paraEps,
  fechaActual,
  horaActual,
  ocupado,
  onConfirmar,
  onVolver,
}) {
  const [franjas, setFranjas] = useState(null);
  const [error, setError] = useState("");
  const [elegida, setElegida] = useState(null);
  const [revisando, setRevisando] = useState(false);

  useEffect(() => {
    // La búsqueda ya trae solo horarios libres que todavía no empiezan.
    // `paraEps`: la EPS del paciente; solo médicos de ella o de una aliada.
    buscarDisponibilidad({ especialidad_id: especialidadId, para_eps: paraEps })
      .then(setFranjas)
      .catch((err) => setError(err.message));
  }, [especialidadId, paraEps]);

  if (error) return <div className="alert alert--error">{error}</div>;
  if (franjas === null) return <p className="texto-suave">Buscando horarios disponibles…</p>;

  if (revisando && elegida) {
    return (
      <section className="card" aria-labelledby="titulo-confirmar-cambio">
        <h2 className="admin-card__titulo" id="titulo-confirmar-cambio">
          ¿Confirma el cambio?
        </h2>
        <div>
          <Fila etiqueta="Cita actual">
            {formatearFechaLarga(fechaActual)}, {formatearHora(horaActual)}
          </Fila>
          <Fila etiqueta="Nueva fecha y hora">
            {formatearFechaLarga(elegida.fecha)}, {formatearHora(elegida.hora)}
          </Fila>
          <Fila etiqueta="Especialista">{elegida.especialista.nombre}</Fila>
          <Fila etiqueta="Sede">
            {elegida.sede.nombre} · {capitalizar(elegida.modalidad)}
          </Fila>
        </div>
        <div className="acciones-admin">
          <button className="btn btn--primary" disabled={ocupado} onClick={() => onConfirmar(elegida)}>
            {ocupado ? "Cambiando…" : "Sí, cambiar la cita"}
          </button>
          <button className="btn btn--outline" disabled={ocupado} onClick={() => setRevisando(false)}>
            Elegir otro horario
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card selector-horario-admin" aria-labelledby="titulo-nuevo-horario">
      {franjas.length === 0 ? (
        <>
          <h2 className="admin-card__titulo" id="titulo-nuevo-horario">
            Elija el nuevo horario
          </h2>
          <p className="texto-suave">No hay otros horarios disponibles de {especialidadNombre} en este momento.</p>
        </>
      ) : (
        <DiasYHoras
          franjas={franjas}
          elegidaId={elegida?.id}
          onElegir={setElegida}
          titulo="Elija el nuevo horario"
          tituloId="titulo-nuevo-horario"
        />
      )}
      <div className="acciones-admin">
        <button className="btn btn--primary" disabled={!elegida} onClick={() => setRevisando(true)}>
          Continuar
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </section>
  );
}
