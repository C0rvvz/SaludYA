import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { obtenerPacienteActual, salirPaciente } from "../api/auth";
import AvisoInactividad from "../components/AvisoInactividad";
import { useSesionSegura } from "../hooks/useSesionSegura";
import { borrarToken, guardarMotivoCierre, guardarToken, leerToken } from "../utils/sesion";

const AuthContext = createContext(null);

const TIPO = "paciente";

/**
 * Sesión del paciente. El token vive solo en esta pestaña (utils/sesion.js);
 * useSesionSegura la cierra tras 2 minutos sin actividad (RNF-24) o si se
 * abre en otra pestaña o dispositivo (RNF-17).
 */
export function AuthProvider({ children }) {
  const [paciente, setPaciente] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarPacienteActual = useCallback(async () => {
    if (!leerToken(TIPO)) {
      setPaciente(null);
      setCargando(false);
      return;
    }
    try {
      const datos = await obtenerPacienteActual();
      setPaciente(datos);
    } catch (err) {
      // Token vencido/inválido -- se limpia para no quedar en un
      // estado a medias donde el front cree que hay sesión pero el
      // backend ya no la reconoce. Si el servidor la cerró, se dice por qué.
      borrarToken(TIPO);
      if (err.status === 401) guardarMotivoCierre(TIPO, err.message);
      setPaciente(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarPacienteActual();
  }, [cargarPacienteActual]);

  const iniciarSesion = useCallback(
    (token) => {
      guardarToken(TIPO, token);
      return cargarPacienteActual();
    },
    [cargarPacienteActual]
  );

  // La sesión ya no sirve (inactividad, otra pestaña, el servidor la cerró):
  // se limpia aquí y el motivo se muestra en la pantalla de ingreso.
  const cerrarLocal = useCallback((mensaje) => {
    borrarToken(TIPO);
    if (mensaje) guardarMotivoCierre(TIPO, mensaje);
    setPaciente(null);
  }, []);

  const cerrarSesion = useCallback(() => {
    const token = leerToken(TIPO);
    cerrarLocal(null);
    // También en el servidor: el token deja de servir aunque alguien lo haya copiado.
    if (token) salirPaciente(token).catch(() => {});
  }, [cerrarLocal]);

  const { segundosRestantes, seguirConectado } = useSesionSegura(TIPO, {
    activa: Boolean(paciente),
    renovar: obtenerPacienteActual,
    cerrarLocal,
  });

  // Mismo objeto mientras no cambie la sesión: evita volver a dibujar a todos los que la usan.
  const value = useMemo(
    () => ({
      paciente,
      cargando,
      estaAutenticado: Boolean(paciente),
      iniciarSesion,
      cerrarSesion,
    }),
    [paciente, cargando, iniciarSesion, cerrarSesion]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {segundosRestantes !== null && (
        <AvisoInactividad segundos={segundosRestantes} onSeguir={seguirConectado} onSalir={cerrarSesion} />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
