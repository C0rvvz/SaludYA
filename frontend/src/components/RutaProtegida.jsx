import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RutaProtegida({ children }) {
  const { estaAutenticado, cargando } = useAuth();

  if (cargando) return null;
  if (!estaAutenticado) return <Navigate to="/iniciar-sesion" replace />;

  return children;
}
