import { useCallback, useEffect, useMemo, useState } from "react";
import { obtenerPersonalActual, salirPersonal } from "../api/admin";
import AvisoInactividad from "../components/AvisoInactividad";
import { useSesionSegura } from "../hooks/useSesionSegura";
import { borrarToken, guardarMotivoCierre, guardarToken, leerToken } from "../utils/sesion";
import { PersonalContext } from "./personal";

const TIPO = "personal";

/**
 * Sesión del personal. `tienePermiso` solo sirve para mostrar u ocultar
 * opciones: el backend vuelve a verificar el permiso en cada acción.
 * Como la del paciente, vive solo en esta pestaña y se cierra tras 2
 * minutos sin actividad o si se abre en otra pestaña (useSesionSegura).
 */
export default function PersonalProvider({ children }) {
  const [personal, setPersonal] = useState(null);
  const [cargando, setCargando] = useState(() => Boolean(leerToken(TIPO)));

  const cargar = useCallback(() => {
    if (!leerToken(TIPO)) return Promise.resolve();
    return obtenerPersonalActual()
      .then(setPersonal)
      .catch((err) => {
        // Token vencido, inválido o cuenta desactivada: se limpia la sesión y se dice por qué.
        borrarToken(TIPO);
        if (err.status === 401) guardarMotivoCierre(TIPO, err.message);
        setPersonal(null);
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const iniciarSesion = useCallback((token, datosPersonal) => {
    guardarToken(TIPO, token);
    setPersonal(datosPersonal);
  }, []);

  const cerrarLocal = useCallback((mensaje) => {
    borrarToken(TIPO);
    if (mensaje) guardarMotivoCierre(TIPO, mensaje);
    setPersonal(null);
  }, []);

  const cerrarSesion = useCallback(() => {
    const token = leerToken(TIPO);
    cerrarLocal(null);
    // También en el servidor: el token deja de servir aunque alguien lo haya copiado.
    if (token) salirPersonal(token).catch(() => {});
  }, [cerrarLocal]);

  const { segundosRestantes, seguirConectado } = useSesionSegura(TIPO, {
    activa: Boolean(personal),
    renovar: obtenerPersonalActual,
    cerrarLocal,
  });

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

  return (
    <PersonalContext.Provider value={value}>
      {children}
      {segundosRestantes !== null && (
        <AvisoInactividad segundos={segundosRestantes} onSeguir={seguirConectado} onSalir={cerrarSesion} />
      )}
    </PersonalContext.Provider>
  );
}
