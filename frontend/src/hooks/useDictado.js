import { useCallback, useEffect, useRef, useState } from "react";

// Se busca al usarlo (no al cargar el archivo), por si el navegador lo agrega después.
const claseReconocimiento = () =>
  typeof window === "undefined" ? null : (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null);

const ERRORES = {
  "not-allowed": "Para hablarle a Eli, permita el uso del micrófono en su navegador.",
  "service-not-allowed": "Para hablarle a Eli, permita el uso del micrófono en su navegador.",
  "no-speech": "No le escuché. Toque el micrófono e intente de nuevo.",
  "audio-capture": "No encontramos un micrófono en este equipo.",
  network: "No pudimos usar el dictado en este momento. Escriba su mensaje.",
};

/**
 * Dictado por voz para escribirle a Eli ("Escriba o hable…"), con el
 * reconocimiento de voz del navegador (Web Speech API, en español de
 * Colombia). Lo dictado va apareciendo en el campo; la persona lo revisa
 * y lo envía ella misma.
 *
 * Ojo: en Chrome y Edge el audio lo procesa el servicio de voz del
 * navegador (Google o Microsoft), no SaludYA. Por eso solo se activa
 * cuando la persona toca el micrófono.
 *
 * `disponible` es false en navegadores sin esta función (p. ej. Firefox):
 * entonces no se muestra el micrófono.
 */
export default function useDictado(onTexto) {
  const [escuchando, setEscuchando] = useState(false);
  const [error, setError] = useState("");
  const reconocimiento = useRef(null);
  const alRecibir = useRef(onTexto);

  useEffect(() => {
    alRecibir.current = onTexto;
  });

  // Al cerrar el chat o salir de la página, se deja de escuchar.
  useEffect(() => () => reconocimiento.current?.abort(), []);

  const alternar = useCallback(() => {
    const Reconocimiento = claseReconocimiento();
    if (!Reconocimiento) return;
    if (reconocimiento.current) {
      reconocimiento.current.stop();
      return;
    }
    const r = new Reconocimiento();
    r.lang = "es-CO";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (evento) => alRecibir.current([...evento.results].map((x) => x[0].transcript).join(""));
    r.onerror = (evento) => setError(ERRORES[evento.error] ?? "");
    r.onend = () => {
      reconocimiento.current = null;
      setEscuchando(false);
    };
    reconocimiento.current = r;
    setError("");
    setEscuchando(true);
    r.start();
  }, []);

  return { disponible: Boolean(claseReconocimiento()), escuchando, error, alternar };
}
