import { useEffect, useRef, useState } from "react";
import { cargarTurnstile, llaveVerificacion } from "../utils/verificacion";

/**
 * Casilla "No soy un robot" (diseño 2a) con verificación real de Cloudflare
 * Turnstile. Al tocarla, Cloudflare comprueba en segundo plano que es una
 * persona (casi siempre sin pedir nada más; si duda, muestra su propio reto
 * debajo) y entrega un token de un solo uso que el backend vuelve a
 * comprobar: `onToken(token | null)`.
 *
 * El token sirve una sola vez: después de cada envío, quien la usa le
 * cambia la `key` para empezar de nuevo.
 */
export default function VerificacionHumana({ onToken }) {
  const llave = llaveVerificacion();
  const contenedor = useRef(null);
  const widget = useRef(null);
  const avisar = useRef(onToken);
  const [estado, setEstado] = useState("pendiente"); // pendiente | verificando | listo | error

  useEffect(() => {
    avisar.current = onToken;
  });

  useEffect(() => {
    if (!llave) return undefined;
    let vigente = true;
    cargarTurnstile()
      .then((turnstile) => {
        if (!vigente || !contenedor.current) return;
        widget.current = turnstile.render(contenedor.current, {
          sitekey: llave,
          language: "es",
          appearance: "interaction-only", // solo se ve si Cloudflare necesita preguntar algo
          execution: "execute", // empieza cuando la persona toca la casilla
          callback: (token) => {
            setEstado("listo");
            avisar.current(token);
          },
          "expired-callback": () => {
            setEstado("pendiente");
            avisar.current(null);
          },
          "error-callback": () => {
            setEstado("error");
            avisar.current(null);
          },
        });
      })
      .catch(() => vigente && setEstado("error"));
    return () => {
      vigente = false;
      if (widget.current != null) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [llave]);

  if (!llave) return null;

  function tocar() {
    if (estado === "listo" || estado === "verificando") return;
    if (widget.current == null) {
      window.location.reload(); // el script de Cloudflare no cargó: se intenta de nuevo
      return;
    }
    if (estado === "error") window.turnstile.reset(widget.current);
    setEstado("verificando");
    window.turnstile.execute(widget.current);
  }

  const texto = {
    pendiente: "No soy un robot",
    verificando: "Verificando...",
    listo: "No soy un robot",
    error: "No se pudo verificar. Toque para intentar de nuevo.",
  }[estado];

  return (
    <div className="verificacion">
      <button
        type="button"
        role="checkbox"
        aria-checked={estado === "listo"}
        className={`verificacion__casilla is-${estado}`}
        onClick={tocar}
      >
        <span className="verificacion__cuadro" aria-hidden="true">
          {estado === "listo" && (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="m5 12.5 4.5 4.5L19 7.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {estado === "verificando" && <span className="verificacion__girando" />}
        </span>
        <span className="verificacion__texto">
          {texto}
          {estado !== "error" && (
            <span className="campo-obligatorio" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </span>
        <span className="verificacion__escudo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
            <path d="M12 3 5 6v5.5c0 4.3 3 8.1 7 9.5 4-1.4 7-5.2 7-9.5V6l-7-3Z" stroke="#1b5fa8" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m9 12 2 2 4-4" stroke="#1b5fa8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Verificación</span>
        </span>
      </button>
      {/* Aquí aparece el reto de Cloudflare, solo si lo necesita */}
      <div ref={contenedor} className="verificacion__reto" />
    </div>
  );
}
