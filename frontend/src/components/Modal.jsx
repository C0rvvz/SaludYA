import { useEffect } from "react";

/**
 * Modal genérico y reutilizable (overlay + tarjeta + botón de cierre).
 * No depende de librerías externas: solo React + CSS propio (ver
 * .modal-overlay / .modal-card en styles/global.css).
 */
export default function Modal({ titulo, onClose, children }) {
  useEffect(() => {
    function manejarEscape(evento) {
      if (evento.key === "Escape") onClose();
    }
    document.addEventListener("keydown", manejarEscape);
    return () => document.removeEventListener("keydown", manejarEscape);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-card__titulo">
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
      </div>
    </div>
  );
}