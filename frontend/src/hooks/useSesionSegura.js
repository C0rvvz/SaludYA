import { useCallback, useEffect, useRef, useState } from "react";
import {
  anunciarSesion,
  EVENTO_SESION_CERRADA,
  escucharOtraPestana,
  marcarActividad,
  ultimaActividadDe,
} from "../utils/sesion";

export const MINUTOS_INACTIVIDAD = 2; // igual a SESION_INACTIVIDAD_MINUTOS en el backend
const LIMITE = MINUTOS_INACTIVIDAD * 60_000;
const AVISAR_ANTES = 30_000; // el aviso "¿Sigue ahí?" sale 30 s antes del cierre
const RENOVAR_CADA = 15_000; // con actividad, se le avisa al servidor como mucho cada 15 s
const EVENTOS_DE_ACTIVIDAD = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];

export const MENSAJE_INACTIVIDAD = "Su sesión se cerró por seguridad después de 2 minutos sin actividad. Inicie sesión de nuevo.";
export const MENSAJE_OTRA_PESTANA =
  "Se abrió SaludYA con su cuenta en otra pestaña. Por seguridad, aquí se cerró la sesión.";

/**
 * Mantiene segura la sesión de `tipo` ("paciente" o "personal") mientras `activa`:
 *
 * - RNF-24: sin actividad durante 2 minutos, la sesión se cierra; 30 s antes
 *   se avisa ("¿Sigue ahí?"). Mientras la persona usa la página (mueve el
 *   mouse, escribe, toca), se le avisa al servidor con `renovar()` para que
 *   tampoco la cierre allá.
 * - RNF-17: si se abre la sesión en otra pestaña, esta se cierra.
 * - Si el servidor rechaza la sesión en cualquier petición, se cierra aquí.
 *
 * `cerrarLocal(mensaje)` limpia la sesión de esta pestaña y guarda el motivo.
 * Devuelve los segundos que faltan para el cierre cuando hay que avisar (o null).
 */
export function useSesionSegura(tipo, { activa, renovar, cerrarLocal }) {
  const [segundosRestantes, setSegundosRestantes] = useState(null);
  const renovando = useRef(false);

  const mantenerViva = useCallback(() => {
    if (renovando.current || Date.now() - ultimaActividadDe(tipo) < RENOVAR_CADA) return;
    renovando.current = true;
    renovar()
      .catch(() => {}) // si el servidor ya la cerró, apiFetch avisa y se cierra aquí también
      .finally(() => {
        renovando.current = false;
      });
  }, [tipo, renovar]);

  useEffect(() => {
    if (!activa) return undefined;

    // La sesión se acaba de abrir o de comprobar con el servidor: eso es actividad.
    marcarActividad(tipo);
    anunciarSesion(tipo);
    const dejarDeEscuchar = escucharOtraPestana(tipo, () => cerrarLocal(MENSAJE_OTRA_PESTANA));
    const alCerrarseEnElServidor = (evento) => {
      if (evento.detail.tipo === tipo) cerrarLocal(evento.detail.mensaje);
    };
    window.addEventListener(EVENTO_SESION_CERRADA, alCerrarseEnElServidor);
    for (const nombre of EVENTOS_DE_ACTIVIDAD) window.addEventListener(nombre, mantenerViva, { passive: true });

    const reloj = setInterval(() => {
      const quedan = LIMITE - (Date.now() - ultimaActividadDe(tipo));
      if (quedan <= 0) cerrarLocal(MENSAJE_INACTIVIDAD);
      else setSegundosRestantes(quedan <= AVISAR_ANTES ? Math.ceil(quedan / 1000) : null);
    }, 1000);

    return () => {
      clearInterval(reloj);
      setSegundosRestantes(null);
      dejarDeEscuchar();
      window.removeEventListener(EVENTO_SESION_CERRADA, alCerrarseEnElServidor);
      for (const nombre of EVENTOS_DE_ACTIVIDAD) window.removeEventListener(nombre, mantenerViva);
    };
  }, [activa, tipo, mantenerViva, cerrarLocal]);

  const seguirConectado = useCallback(() => {
    renovar()
      .then(() => setSegundosRestantes(null))
      .catch(() => {});
  }, [renovar]);

  return { segundosRestantes: activa ? segundosRestantes : null, seguirConectado };
}
