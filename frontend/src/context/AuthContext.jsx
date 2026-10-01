import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { obtenerPacienteActual } from "../api/auth";

const AuthContext = createContext(null);

const TOKEN_KEY = "saludya_token";

export function AuthProvider({ children }) {
  const [paciente, setPaciente] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarPacienteActual = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setPaciente(null);
      setCargando(false);
      return;
    }
    try {
      const datos = await obtenerPacienteActual();
      setPaciente(datos);
    } catch {
      // Token vencido/inválido -- se limpia para no quedar en un
      // estado a medias donde el front cree que hay sesión pero el
      // backend ya no la reconoce.
      localStorage.removeItem(TOKEN_KEY);
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
      localStorage.setItem(TOKEN_KEY, token);
      return cargarPacienteActual();
    },
    [cargarPacienteActual]
  );

  const cerrarSesion = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setPaciente(null);
  }, []);

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
