import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { usePersonal } from "../../context/personal";
import Logo from "../Logo";

// Solo aparecen las secciones que el rol puede usar.
const SECCIONES = [
  { to: "/admin/dashboard", texto: "Dashboard", permiso: "ver_reportes" },
  { to: "/admin/citas", texto: "Gestión de citas", permiso: "ver_citas" },
  { to: "/admin/auditoria", texto: "Auditoría", permiso: "ver_auditoria" },
  { to: "/admin/usuarios", texto: "Usuarios", permiso: "gestionar_usuarios" },
];

// Del prototipo, todavía sin construir (ver el plan de fases).
const PROXIMAMENTE = ["Reportes", "Centro de recordatorios", "Lista de espera"];

/** Estructura del apartado de administración: menú lateral y contenido. */
export default function AdminLayout() {
  const { personal, cerrarSesion, tienePermiso } = usePersonal();
  const navigate = useNavigate();

  function salir() {
    cerrarSesion();
    navigate("/admin/ingresar", { replace: true });
  }

  return (
    <div className="admin">
      <aside className="admin-sidebar">
        <Logo />
        <div className="admin-sidebar__usuario">
          <strong>{personal.nombre}</strong>
          <span className="admin-sidebar__rol">{personal.rol_texto}</span>
        </div>

        <nav className="admin-nav" aria-label="Secciones de administración">
          {SECCIONES.filter((s) => tienePermiso(s.permiso)).map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) => `admin-nav__enlace ${isActive ? "is-active" : ""}`}
            >
              {s.texto}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__proximamente">
          <span>Próximamente</span>
          {PROXIMAMENTE.map((texto) => (
            <span key={texto} className="admin-nav__enlace is-deshabilitado" aria-disabled="true">
              {texto}
            </span>
          ))}
        </div>

        <button type="button" className="admin-sidebar__salir" onClick={salir}>
          Cerrar sesión
        </button>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
