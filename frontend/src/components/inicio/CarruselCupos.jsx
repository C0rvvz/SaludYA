import { useEffect, useState } from "react";

const CADA = 5500; // ms entre una diapositiva y la siguiente

const sinMovimiento = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function Flecha({ hacia, color }) {
  const trazo = hacia === "izquierda" ? "M19 12H6M11 6.5 5.5 12 11 17.5" : "M5 12h13M13 6.5 18.5 12 13 17.5";
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d={trazo} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Carrusel del Home: fotos y la tarjeta "Próximo cupo" con el horario libre
 * más cercano de cada especialidad. Avanza solo cada 5,5 s; se pausa con el
 * cursor o el foco encima (WCAG 2.2.2) y no se mueve solo si la persona
 * pidió reducir el movimiento. Los controles reinician el temporizador.
 */
export default function CarruselCupos({ cupos }) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [reinicios, setReinicios] = useState(0); // cambia al usar los controles
  const total = cupos.length;

  useEffect(() => {
    if (pausado || total < 2 || sinMovimiento()) return undefined;
    const temporizador = setInterval(() => setIndice((i) => (i + 1) % total), CADA);
    return () => clearInterval(temporizador);
  }, [pausado, total, reinicios]);

  function ir(n) {
    setIndice(((n % total) + total) % total);
    setReinicios((r) => r + 1);
  }

  const pausa = {
    onMouseEnter: () => setPausado(true),
    onMouseLeave: () => setPausado(false),
    onFocus: () => setPausado(true),
    onBlur: (evento) => {
      if (!evento.currentTarget.contains(evento.relatedTarget)) setPausado(false);
    },
  };

  return (
    <section className="inicio-carrusel" aria-roledescription="carrusel" aria-label="Próximos cupos disponibles">
      <div className="inicio-carrusel__fotos" {...pausa}>
        {cupos.map((c, k) => (
          <img
            key={c.id}
            src={c.foto}
            alt=""
            className={k === indice ? "is-activa" : undefined}
            referrerPolicy="no-referrer"
            loading={k === 0 ? "eager" : "lazy"}
          />
        ))}
      </div>

      <div className="inicio-cupo" {...pausa}>
        <div className="inicio-cupo__arriba">
          <span className="inicio-cupo__titulo">Próximo cupo</span>
          <span className="inicio-cupo__insignia">Disponible</span>
        </div>

        {/* Todas en la misma celda: la tarjeta no cambia de alto al pasar de una a otra. */}
        <div className="inicio-cupo__diapositivas" aria-live={pausado ? "polite" : "off"}>
          {cupos.map((c, k) => (
            <div
              key={c.id}
              className={`inicio-cupo__diapositiva ${k === indice ? "is-activa" : ""}`}
              role="group"
              aria-roledescription="diapositiva"
              aria-label={`${k + 1} de ${total}`}
              aria-hidden={k !== indice}
            >
              <p className="inicio-cupo__especialidad">{c.especialidad}</p>
              <p className="inicio-cupo__detalle">
                {c.cuando}
                <br />
                {c.lugar}
              </p>
            </div>
          ))}
        </div>

        {total > 1 && (
          <div className="inicio-cupo__pie">
            <div className="inicio-cupo__puntos">
              {cupos.map((c, k) => (
                <button
                  key={c.id}
                  type="button"
                  className={`inicio-cupo__punto ${k === indice ? "is-activo" : ""}`}
                  aria-label={`Ver cupo ${k + 1} de ${total}: ${c.especialidad}`}
                  aria-current={k === indice || undefined}
                  onClick={() => ir(k)}
                />
              ))}
            </div>
            <div className="inicio-cupo__flechas">
              <button type="button" className="inicio-flecha" aria-label="Cupo anterior" onClick={() => ir(indice - 1)}>
                <Flecha hacia="izquierda" color="#0e1f39" />
              </button>
              <button
                type="button"
                className="inicio-flecha inicio-flecha--oscura"
                aria-label="Cupo siguiente"
                onClick={() => ir(indice + 1)}
              >
                <Flecha hacia="derecha" color="#fff" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
