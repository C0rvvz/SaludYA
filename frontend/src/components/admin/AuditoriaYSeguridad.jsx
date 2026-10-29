import { NavLink } from "react-router-dom";
import { usePersonal } from "../../context/personal";
import { PESTANAS_AUDITORIA } from "../../utils/auditoriaYSeguridad";

/**
 * "Auditoría y seguridad": una sola entrada del menú, con una pestaña para
 * cada registro. Las dos responden lo mismo (quién hizo qué en el sistema y
 * cuándo) y las usa el administrador. Los registros no se mezclan: son
 * distintos, con columnas distintas.
 *   - Auditoría: las acciones sobre citas, pacientes, especialistas y
 *     cuentas del personal (HU-80 a HU-85).
 *   - Seguridad: los accesos, las alertas y las sesiones activas.
 * Cada pestaña es su propia dirección (/admin/auditoria, /admin/seguridad) y
 * solo aparece si el rol tiene el permiso (utils/auditoriaYSeguridad).
 */

/** El título común, las pestañas y, debajo, la descripción de la pestaña con sus acciones (`children`). */
export default function EncabezadoAuditoriaYSeguridad({ descripcion, children }) {
  const { tienePermiso } = usePersonal();
  const visibles = PESTANAS_AUDITORIA.filter((p) => tienePermiso(p.permiso));

  return (
    <>
      <h1 className="admin-titulo">Auditoría y seguridad</h1>
      {visibles.length > 1 && (
        <nav className="pestanas-admin" aria-label="Auditoría y seguridad">
          {visibles.map((p) => (
            <NavLink key={p.to} to={p.to} className={({ isActive }) => `pestana-admin ${isActive ? "is-active" : ""}`}>
              <span className="pestana-admin__texto">{p.texto}</span>
              <span className="pestana-admin__detalle">{p.detalle}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <div className="admin-encabezado">
        <p className="admin-subtitulo">{descripcion}</p>
        {children}
      </div>
    </>
  );
}
