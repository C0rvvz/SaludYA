import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";

/** Encabezado de las páginas del paciente autenticado ("Agendar cita", "Lista de espera", "Solicitudes" y "Mis citas"). */
export default function EncabezadoPaciente() {
  const { paciente, cerrarSesion } = useAuth();
  const claseEnlace = ({ isActive }) => `nav-paciente__enlace ${isActive ? "is-active" : ""}`;

  return (
    <header className="site-header">
      <Logo />
      <nav className="nav-paciente" aria-label="Menú del paciente">
        <NavLink to="/panel" className={claseEnlace}>
          Agendar cita
        </NavLink>
        <NavLink to="/lista-espera" className={claseEnlace}>
          Lista de espera
        </NavLink>
        <NavLink to="/solicitudes" className={claseEnlace}>
          Solicitudes
        </NavLink>
        <NavLink to="/mis-citas" className={claseEnlace}>
          Mis citas
        </NavLink>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-soft)" }}>
          Hola, {paciente?.nombre?.split(" ")[0]}
        </span>
        <button className="btn btn--outline" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
