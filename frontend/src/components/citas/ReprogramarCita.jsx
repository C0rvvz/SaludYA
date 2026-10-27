import { useCallback, useEffect, useState } from "react";
import { buscarDisponibilidad } from "../../api/catalogo";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import DiasYHoras from "../agendar/DiasYHoras";
import { Chevron } from "../Iconos";
import { formatearHora } from "../../utils/formato";
import { cuandoEs, nombreCorto } from "../../utils/agendar";

// "Jue 22 oct · 9:00 a. m."
const cuando = (fecha, hora) => `${cuandoEs(fecha)} · ${formatearHora(hora)}`;

/**
 * "Reprogramar su cita" — HU-20. Horarios libres de la misma especialidad;
 * primero los del mismo médico (si tiene), con la opción de ver los de
 * cualquier profesional. A la izquierda, la cita actual y la nueva, para
 * confirmar el cambio viéndolas juntas.
 *
 * `onConfirmar(franja)` devuelve una promesa: si falla, el error se muestra
 * aquí; si el horario ya no estaba libre (409), se vuelven a consultar.
 */
export default function ReprogramarCita({ cita, onConfirmar, onVolver }) {
  const { paciente } = useAuth();
  const especialidad = cita.especialista.especialidad.nombre;
  const [franjas, setFranjas] = useState(null);
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const [soloSuMedico, setSoloSuMedico] = useState(true);
  const [elegida, setElegida] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const buscar = useCallback(
    () =>
      // Solo médicos de su EPS o de una aliada (a un particular, de cualquiera).
      buscarDisponibilidad({ especialidad_id: cita.especialista.especialidad.id, para_eps: paciente?.eps_id })
        .then((lista) => {
          setFranjas(lista);
          setErrorBusqueda("");
        })
        .catch((err) => setErrorBusqueda(err.message)),
    [cita.especialista.especialidad.id, paciente?.eps_id]
  );

  useEffect(() => {
    buscar();
  }, [buscar]);

  async function confirmar() {
    setOcupado(true);
    setError("");
    try {
      await onConfirmar(elegida);
    } catch (err) {
      setError(err.message);
      if (err instanceof ApiError && err.status === 409) {
        setElegida(null);
        buscar();
      }
    } finally {
      setOcupado(false);
    }
  }

  const elegir = (franja) => {
    setElegida(franja);
    setError("");
  };

  const deSuMedico = (franjas ?? []).filter((f) => f.especialista.id === cita.especialista.id);
  const filtrar = soloSuMedico && deSuMedico.length > 0;
  const visibles = filtrar ? deSuMedico : (franjas ?? []);

  const titulo = (
    <h2 id="titulo-horarios-reprogramar" className="reprogramar-cita__titulo-horas">
      Horarios disponibles
    </h2>
  );
  let horarios;
  if (errorBusqueda) {
    horarios = (
      <>
        {titulo}
        <div className="alert alert--error">{errorBusqueda}</div>
      </>
    );
  } else if (franjas === null) {
    horarios = (
      <>
        {titulo}
        <p className="agendar-cargando">Buscando horarios disponibles…</p>
      </>
    );
  } else if (franjas.length === 0) {
    horarios = (
      <>
        {titulo}
        <p className="agendar-vacio">No hay otros horarios disponibles de {especialidad} en este momento.</p>
      </>
    );
  } else {
    horarios = (
      <>
        {deSuMedico.length > 0 && deSuMedico.length < franjas.length && (
          <div className="chips-sede" role="group" aria-label="Profesional">
            <button
              type="button"
              className={`chip-sede ${filtrar ? "is-elegida" : ""}`}
              aria-pressed={filtrar}
              onClick={() => {
                setSoloSuMedico(true);
                setElegida(null);
              }}
            >
              Con {nombreCorto(cita.especialista.nombre)}
            </button>
            <button
              type="button"
              className={`chip-sede ${filtrar ? "" : "is-elegida"}`}
              aria-pressed={!filtrar}
              onClick={() => {
                setSoloSuMedico(false);
                setElegida(null);
              }}
            >
              Cualquier profesional
            </button>
          </div>
        )}
        <DiasYHoras
          key={filtrar ? "su-medico" : "todos"}
          franjas={visibles}
          elegidaId={elegida?.id}
          onElegir={elegir}
          titulo="Horarios disponibles"
          tituloId="titulo-horarios-reprogramar"
        />
      </>
    );
  }

  return (
    <div className="reprogramar-cita">
      <button type="button" className="btn-volver" onClick={onVolver} disabled={ocupado}>
        <span className="btn__circulo">
          <Chevron hacia="izquierda" />
        </span>
        Volver a mis citas
      </button>
      <div className="mis-citas__titulo">
        <h1>Reprogramar su cita</h1>
        <p>Elija un nuevo horario. El anterior quedará libre para otro paciente.</p>
      </div>

      <div className="reprogramar-cita__cuerpo">
        <div className="reprogramar-cita__resumen">
          <div className="cambio-cita">
            <p className="rotulo">Cita actual</p>
            <p className="cambio-cita__cuando cambio-cita__cuando--tachada">{cuando(cita.fecha, cita.hora)}</p>
            <p className="cambio-cita__quien">
              {especialidad} · {nombreCorto(cita.especialista.nombre)}
            </p>
          </div>
          <span className="reprogramar-cita__flecha" aria-hidden="true">
            ↓
          </span>
          <div className={`cambio-cita cambio-cita--nueva ${elegida ? "" : "is-vacia"}`} aria-live="polite">
            <p className="rotulo">Nueva cita</p>
            {elegida ? (
              <>
                <p className="cambio-cita__cuando">{cuando(elegida.fecha, elegida.hora)}</p>
                <p className="cambio-cita__quien">
                  {especialidad} · {nombreCorto(elegida.especialista.nombre)} · {elegida.sede.nombre}
                </p>
              </>
            ) : (
              <p className="cambio-cita__quien">Elija un día y una hora.</p>
            )}
          </div>

          {error && (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            className="btn btn--primary btn--bloque"
            disabled={!elegida || ocupado}
            onClick={confirmar}
          >
            {ocupado ? "Cambiando su cita…" : "Confirmar el cambio"}
          </button>
          <button
            type="button"
            className="btn btn--outline btn--texto-peligro btn--bloque"
            disabled={ocupado}
            onClick={onVolver}
          >
            No, volver
          </button>
        </div>

        <section className="card agendar-horas reprogramar-cita__horarios" aria-labelledby="titulo-horarios-reprogramar">
          {horarios}
        </section>
      </div>
    </div>
  );
}
