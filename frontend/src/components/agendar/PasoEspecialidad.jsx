import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Chevron } from "../Iconos";
import EpsMedico from "./EpsMedico";
import FotoProfesional from "./FotoProfesional";
import { formatearHora } from "../../utils/formato";
import { agruparPorEspecialista, diaCorto, resumenEspecialidades, sinTildes } from "../../utils/agendar";
import { puedeAgendarCon } from "../../utils/eps";

/**
 * Paso 1 de "Agendar": la especialidad (HU-09). Cada tarjeta dice cuántos
 * profesionales tienen cupo y desde cuándo. El buscador también encuentra
 * médicos por su nombre: al tocar uno se pasa directo a sus horarios.
 * Solo cuentan los médicos de su EPS o de una aliada; los de otras EPS
 * aparecen en la búsqueda, en gris y sin poder elegirlos (utils/eps).
 */
export default function PasoEspecialidad({ especialidades, franjas, elegida, onElegir, onContinuar, onPreguntarEli }) {
  const { paciente } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const agendables = useMemo(() => franjas.filter((f) => puedeAgendarCon(paciente, f.especialista)), [franjas, paciente]);
  const resumen = useMemo(() => resumenEspecialidades(especialidades, agendables), [especialidades, agendables]);
  // Primero los que puede elegir; los de otras EPS, al final.
  const medicosConCupo = useMemo(
    () =>
      agruparPorEspecialista(franjas).sort(
        (a, b) => puedeAgendarCon(paciente, b.especialista) - puedeAgendarCon(paciente, a.especialista)
      ),
    [franjas, paciente]
  );

  const termino = sinTildes(busqueda.trim());
  const visibles = termino ? resumen.filter((e) => sinTildes(e.nombre).includes(termino)) : resumen;
  const medicos = termino ? medicosConCupo.filter((g) => sinTildes(g.especialista.nombre).includes(termino)) : [];
  const nombreElegida = resumen.find((e) => e.id === elegida)?.nombre;

  return (
    <>
      {/* Sin "¿No sabe cuál? Pregúntele a Eli": el botón flotante de Eli ya está en la pantalla. */}
      <div className="agendar-encabezado">
        <h1>¿Qué especialista busca?</h1>
      </div>

      <div className="buscador-agendar">
        <label htmlFor="buscar-especialista" className="sr-only">
          Buscar una especialidad o un médico
        </label>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id="buscar-especialista"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={
            window.matchMedia?.("(max-width: 560px)").matches
              ? "Especialidad o médico"
              : "Escriba una especialidad o el nombre del médico"
          }
          autoComplete="off"
        />
      </div>

      {medicos.length > 0 && (
        <section aria-labelledby="medicos-encontrados">
          <p id="medicos-encontrados" className="rotulo">
            Médicos
          </p>
          <div className="agendar-medicos-encontrados">
            {medicos.map(({ especialista, franjas: suyas }) => {
              const puede = puedeAgendarCon(paciente, especialista);
              return (
                <button
                  key={especialista.id}
                  type="button"
                  className={`tarjeta-medico ${puede ? "" : "tarjeta-medico--otra-eps"}`}
                  disabled={!puede}
                  onClick={() => onContinuar(especialista.especialidad.id, especialista.id)}
                >
                  <FotoProfesional nombre={especialista.nombre} />
                  <span className="tarjeta-medico__textos">
                    <span className="tarjeta-medico__nombre">
                      {especialista.nombre} <EpsMedico especialista={especialista} paciente={paciente} />
                    </span>
                    <span className="tarjeta-medico__donde">{especialista.especialidad.nombre}</span>
                    <span className="tarjeta-medico__proximo">
                      {puede
                        ? `Próximo: ${diaCorto(suyas[0].fecha)} · ${formatearHora(suyas[0].hora)}`
                        : "No disponible con su EPS"}
                    </span>
                  </span>
                  {puede && (
                    <span className="btn__circulo" aria-hidden="true">
                      <Chevron />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="lista-especialidades">
        <p id="lista-especialidades" className="rotulo">
          Especialidades
        </p>
        {visibles.length === 0 && medicos.length === 0 ? (
          <p className="agendar-vacio">
            No encontramos «{busqueda.trim()}». Revise cómo lo escribió o{" "}
            <button type="button" className="btn--link" onClick={onPreguntarEli}>
              pregúntele a Eli
            </button>
            .
          </p>
        ) : (
          <div className="especialidades-agendar">
            {visibles.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`tarjeta-especialidad ${e.id === elegida ? "is-elegida" : ""}`}
                aria-pressed={e.id === elegida}
                onClick={() => onElegir(e.id)}
              >
                <span className="tarjeta-especialidad__fila">
                  <span className="tarjeta-especialidad__nombre">{e.nombre}</span>
                  {e.id === elegida && <span aria-hidden="true">✓</span>}
                </span>
                <span className="tarjeta-especialidad__cuantos">
                  {e.profesionales === 1 ? "1 profesional" : `${e.profesionales} profesionales`}
                </span>
                <span className={`tarjeta-especialidad__desde ${e.desde ? "" : "is-sin-cupo"}`}>
                  {e.desde ?? "Sin cupos por ahora"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="agendar-continuar">
        <button
          type="button"
          className="btn btn--primary btn--con-circulo-final"
          disabled={!nombreElegida}
          onClick={() => onContinuar(elegida)}
        >
          {nombreElegida ? `Continuar con ${nombreElegida}` : "Elija una especialidad"}
          <span className="btn__circulo">
            <Chevron />
          </span>
        </button>
      </div>
    </>
  );
}
