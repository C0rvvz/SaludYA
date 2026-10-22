import { useEffect, useId, useRef } from "react";

/**
 * Ventana sobre la página (velo azul oscuro y tarjeta blanca), para
 * decisiones cortas: cancelar una cita, calificar la atención...
 *
 * - Se cierra con Escape, con un clic en el velo o con los botones propios.
 * - Al abrir, el foco pasa a la ventana; al cerrar, vuelve a donde estaba.
 * - Tab no se sale de la ventana mientras está abierta.
 * - `ocupado`: mientras se envía algo, no se deja cerrar.
 * - `encabezado`: lo que va antes del título (p. ej. la foto del médico).
 */
export default function Ventana({ titulo, encabezado, onCerrar, ocupado = false, children }) {
  const tarjeta = useRef(null);
  const tituloId = useId();
  const actual = useRef({ ocupado, onCerrar });

  useEffect(() => {
    actual.current = { ocupado, onCerrar };
  });

  useEffect(() => {
    const anterior = document.activeElement;
    const enfocables = () =>
      [...tarjeta.current.querySelectorAll("button, input, textarea, select, a[href]")].filter((e) => !e.disabled);
    (enfocables()[0] ?? tarjeta.current).focus();

    function teclado(evento) {
      if (evento.key === "Escape" && !actual.current.ocupado) actual.current.onCerrar();
      if (evento.key !== "Tab") return;
      const lista = enfocables();
      if (lista.length === 0) return;
      const [primero, ultimo] = [lista[0], lista.at(-1)];
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("keydown", teclado);
      anterior?.focus?.();
    };
  }, []);

  return (
    <div
      className="ventana-velo"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !ocupado) onCerrar();
      }}
    >
      <div className="ventana" ref={tarjeta} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}>
        {encabezado}
        <h2 id={tituloId} className="ventana__titulo">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  );
}
