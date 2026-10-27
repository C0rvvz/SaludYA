import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Al pasar a otra página se empieza arriba (sin esto, React conserva el
 * desplazamiento de la anterior). Si la dirección trae una sección
 * (#sedes, #ayuda), la propia página la muestra.
 */
export default function SubirAlCambiarDePagina() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}
