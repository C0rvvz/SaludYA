import { createContext, useContext } from "react";

// Sesión del personal (apartado de administración), aparte de la del paciente.
export const PersonalContext = createContext(null);

export function usePersonal() {
  const ctx = useContext(PersonalContext);
  if (!ctx) throw new Error("usePersonal debe usarse dentro de <PersonalProvider>");
  return ctx;
}
