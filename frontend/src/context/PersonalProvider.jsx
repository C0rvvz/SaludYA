import { useCallback, useEffect, useMemo, useState } from "react";
import { obtenerPersonalActual } from "../api/admin";
import { TOKEN_PERSONAL } from "../api/client";
import { PersonalContext } from "./personal";

/**
 * Sesión del personal. `tienePermiso` solo sirve para mostrar u ocultar
 * opciones: el backend vuelve a verificar el permiso en cada acción.
 */
export default function PersonalProvider({ children }) {
  const [personal, setPersonal] = useState(null);
  const [cargando, setCargando] = useState(() => Boolean(localStorage.getItem(TOKEN_PERSONAL)));

  const cargar = useCallback(() => {
    if (!localStorage.getItem(TOKEN_PERSONAL)) return Promise.resolve();
    return obtenerPersonalActual()
      .then(setPersonal)
      .catch(() => {
        // Token vencido, inválido o cuenta desactivada: se limpia la sesión.
        localStorage.removeItem(TOKEN_PERSONAL);
        setPersonal(null);
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const iniciarSesion = useCallback((token, datosPersonal) => {
    localStorage.setItem(TOKEN_PERSONAL, token);
    setPersonal(datosPersonal);
  }, []);

  const cerrarSesion = useCallback(() => {
    localStorage.removeItem(TOKEN_PERSONAL);
    setPersonal(null);
  }, []);

  // Mismo objeto mientras no cambie la sesión: evita volver a dibujar a todos los que la usan.
  const value = useMemo(
    () => ({
      personal,
      cargando,
      iniciarSesion,
      cerrarSesion,
      tienePermiso: (permiso) => Boolean(personal?.permisos.includes(permiso)),
    }),
    [personal, cargando, iniciarSesion, cerrarSesion]
  );

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}
