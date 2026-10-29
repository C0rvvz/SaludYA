import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePersonal } from "../../context/personal";
import { PESTANAS_AUDITORIA } from "../../utils/auditoriaYSeguridad";
import { iniciales } from "../../utils/avatar";
import { IconoSalir } from "../Iconos";
import { IconoCandado } from "./IconosAdmin";
import "../../styles/admin.css";

// Solo aparecen las secciones que el rol puede usar (mínimo privilegio: ver
// core/permisos.py en el backend). Cada una dice debajo, en pocas palabras,
// para qué sirve: nadie tiene que entrar a adivinarlo. Las de información
// reservada llevan un candado (`reservada`).
const SECCIONES = [
  { to: "/admin/dashboard", texto: "Resumen", ayuda: "Indicadores del día y del mes", permiso: "ver_reportes" },
  { to: "/admin/reportes", texto: "Reportes", ayuda: "Indicadores por periodo", permiso: "ver_reportes" },
  { to: "/admin/citas", texto: "Gestión de citas", ayuda: "Consulta y seguimiento", permiso: "ver_citas" },
  {
    to: "/admin/recordatorios",
    texto: "Recordatorios",
    ayuda: "Mensajes y llamadas programados",
    permiso: "recordatorios",
  },
  {
    to: "/admin/lista-espera",
    texto: "Lista de espera",
    ayuda: "Pacientes en espera de cupo",
    permiso: ["lista_espera", "asignar_prioridad"],
  },
  {
    to: "/admin/solicitudes",
    texto: "Solicitudes",
    ayuda: "Peticiones de los pacientes",
    permiso: "revisar_solicitudes",
  },
  {
    to: "/admin/historia-clinica",
    texto: "Historia clínica",
    ayuda: "Fórmulas y diagnósticos",
    permiso: "historia_clinica",
    reservada: true,
  },
  { to: "/admin/especialistas", texto: "Especialistas", ayuda: "Médicos, sedes y farmacias", permiso: "gestionar_especialistas" },
  // Una sola entrada con dos pestañas (ver AuditoriaYSeguridad): lleva a la primera que el rol puede ver.
  {
    pestanas: PESTANAS_AUDITORIA,
    texto: "Auditoría y seguridad",
    ayuda: "Actividad, accesos y alertas",
    permiso: ["ver_auditoria", "seguridad"],
  },
  { to: "/admin/usuarios", texto: "Usuarios", ayuda: "Cuentas y roles del personal", permiso: "gestionar_usuarios" },
];

/** Estructura del panel del personal: menú lateral oscuro y contenido. */
export default function AdminLayout() {
  const { personal, cerrarSesion, tienePermiso } = usePersonal();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Una sección con pestañas va a la primera permitida y queda marcada en cualquiera de ellas.
  const destino = (s) => s.to ?? s.pestanas.find((p) => tienePermiso(p.permiso)).to;
  const activa = (s, isActive) => isActive || Boolean(s.pestanas?.some((p) => pathname.startsWith(p.to)));

  function salir() {
    cerrarSesion();
    navigate("/admin/ingresar", { replace: true });
  }

  return (
    <div className="admin">
      <aside className="admin-sidebar">
        <Link to="/admin/citas" className="admin-marca" aria-label="SaludYA Personal: ir a Gestión de citas">
          <span className="admin-marca__icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
              <path
                d="M2 12h4l2-7 4 14 2-7h8"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            SaludYA <span className="admin-marca__sub">Personal</span>
          </span>
        </Link>

        <div className="admin-sidebar__usuario">
          <span className="admin-sidebar__iniciales" aria-hidden="true">
            {iniciales(personal.nombre)}
          </span>
          <div>
            <p className="admin-sidebar__nombre">{personal.nombre}</p>
            <p className="admin-sidebar__rol">{personal.rol_texto}</p>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Secciones de administración">
          <span className="admin-nav__titulo" aria-hidden="true">
            Módulos
          </span>
          {SECCIONES.filter((s) => tienePermiso(s.permiso)).map((s) => (
            <NavLink
              key={s.texto}
              to={destino(s)}
              className={({ isActive }) => `admin-nav__enlace ${activa(s, isActive) ? "is-active" : ""}`}
            >
              <span className={s.reservada ? "admin-nav__reservada" : undefined}>
                {s.texto}
                {s.reservada && (
                  <>
                    <IconoCandado />
                    <span className="sr-only">, información reservada</span>
                  </>
                )}
              </span>
              <span className="admin-nav__ayuda">{s.ayuda}</span>
            </NavLink>
          ))}
        </nav>

        <button type="button" className="admin-sidebar__salir" onClick={salir}>
          <IconoSalir />
          Cerrar sesión
        </button>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
