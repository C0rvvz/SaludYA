import { useEffect, useRef } from "react";

/**
 * Modal genérico y reutilizable (overlay + tarjeta + botón de cierre).
 * No depende de librerías externas: solo React + CSS propio (ver
 * .modal-overlay / .modal-card en styles/global.css).
 */
export default function Modal({ titulo, onClose, children }) {
  const overlayRef = useRef(null);

  // Se cierra con Escape (teclado) o con un clic fuera de la tarjeta (ratón),
  // además de los botones "×" y "Entendido".
  useEffect(() => {
    function manejarEscape(evento) {
      if (evento.key === "Escape") onClose();
    }
    function manejarClicFuera(evento) {
      if (evento.target === overlayRef.current) onClose();
    }
    document.addEventListener("keydown", manejarEscape);
    document.addEventListener("click", manejarClicFuera);
    return () => {
      document.removeEventListener("keydown", manejarEscape);
      document.removeEventListener("click", manejarClicFuera);
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <dialog open className="modal-card" aria-modal="true" aria-labelledby="modal-card__titulo">
        <div className="modal-card__header">
          <h2 id="modal-card__titulo">{titulo}</h2>
          <button
            type="button"
            className="modal-card__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="modal-card__body">{children}</div>
        <div className="modal-card__footer">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </dialog>
    </div>
  );
}
