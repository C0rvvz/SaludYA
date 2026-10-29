import { useEffect, useRef } from "react";
import { llevarALaVista } from "../utils/desplazamiento";

/**
 * Para un aviso que aparece arriba de la página (p. ej. "Listo: su petición
 * quedó radicada" después de un formulario largo): cuando `valor` cambia y
 * hay algo que mostrar, lo trae a la vista con suavidad. Devuelve la ref
 * que va en el aviso.
 */
export default function useLlevarALaVista(valor) {
  const ref = useRef(null);
  useEffect(() => {
    if (valor) llevarALaVista(ref.current);
  }, [valor]);
  return ref;
}
