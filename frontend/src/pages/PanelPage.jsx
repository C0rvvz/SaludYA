import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";

export default function PanelPage() {
  const { paciente, cerrarSesion } = useAuth();

  return (
    <div>
      <header className="site-header">
        <Logo />
        <button className="btn btn--outline" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </header>

      <div className="section" style={{ maxWidth: 640 }}>
        <div className="info-card">
          <p className="auth-card__eyebrow">Tu cuenta</p>
          <h1 style={{ fontSize: "var(--text-xl)" }}>Hola, {paciente?.nombre}</h1>
          <p>
            Tu sesión está activa. Buscar especialistas y agendar tu cita
            llega en la próxima parte del proyecto.
          </p>
        </div>
      </div>
    </div>
  );
}
