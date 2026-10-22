/**
 * RNF-24: 30 segundos antes de cerrar la sesión por inactividad, se avisa y
 * se ofrece seguir (la sesión no se cierra sin advertir; WCAG 2.2.1).
 */
export default function AvisoInactividad({ segundos, onSeguir, onSalir }) {
  return (
    <div className="modal-overlay">
      <dialog
        open
        className="modal-card"
        aria-modal="true"
        aria-labelledby="aviso-inactividad"
        aria-describedby="aviso-inactividad-texto"
      >
        <div className="modal-card__header">
          <h2 id="aviso-inactividad">¿Sigue ahí?</h2>
        </div>
        <div className="modal-card__body">
          <p id="aviso-inactividad-texto" aria-live="polite">
            Por seguridad, su sesión se cerrará en <strong>{segundos} segundos</strong> porque no ha tenido actividad.
          </p>
        </div>
        <div className="modal-card__footer acciones-admin">
          <button type="button" className="btn btn--outline" onClick={onSalir}>
            Cerrar sesión
          </button>
          {/* El foco va al botón: basta con Enter para seguir. */}
          <button type="button" className="btn btn--primary" onClick={onSeguir} autoFocus>
            Seguir conectado
          </button>
        </div>
      </dialog>
    </div>
  );
}
