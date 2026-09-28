import { Navigate } from "react-router-dom";
import { usePersonal } from "../../context/personal";

/**
 * Protege las páginas del apartado de administración. Con `permiso`,
 * además oculta la sección a los roles que no lo tienen (el backend de
 * todas formas lo rechazaría con 403).
 */
export default function RutaPersonal({ permiso, children }) {
  const { personal, cargando, tienePermiso } = usePersonal();

  if (cargando) return null;
  if (!personal) return <Navigate to="/admin/ingresar" replace />;
  if (permiso && !tienePermiso(permiso)) {
    return <div className="alert alert--error">Su rol no tiene acceso a esta sección.</div>;
  }
  return children;
}
