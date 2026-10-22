import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { usePersonal } from "../../context/personal";
import Logo from "../Logo";

// Solo aparecen las secciones que el rol puede usar. Cada una dice debajo,
// en pocas palabras, para qué sirve: nadie tiene que entrar a adivinarlo.
const SECCIONES = [
  { to: "/admin/dashboard", texto: "Dashboard", ayuda: "Cifras de hoy y del mes", permiso: "ver_reportes" },
  { to: "/admin/reportes", texto: "Reportes", ayuda: "Indicadores por periodo", permiso: "ver_reportes" },
  { to: "/admin/citas", texto: "Gestión de citas", ayuda: "Buscar y atender las citas", permiso: "ver_citas" },
  {
    to: "/admin/recordatorios",
    texto: "Centro de recordatorios",
    ayuda: "Avisos y llamadas a pacientes",
    permiso: "gestionar_citas",
  },
  { to: "/admin/lista-espera", texto: "Lista de espera", ayuda: "Pacientes esperando un cupo", permiso: "ver_citas" },
  { to: "/admin/solicitudes", texto: "Cartas y peticiones", ayuda: "Lo que piden por escrito", permiso: "ver_citas" },
  { to: "/admin/auditoria", texto: "Auditoría", ayuda: "Quién hizo qué y cuándo", permiso: "ver_auditoria" },
  { to: "/admin/usuarios", texto: "Usuarios", ayuda: "Cuentas y roles del personal", permiso: "gestionar_usuarios" },
];

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
        <Logo to="/admin/citas" />
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
              <span>{s.texto}</span>
              <span className="admin-nav__ayuda">{s.ayuda}</span>
            </NavLink>
          ))}
        </nav>

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
