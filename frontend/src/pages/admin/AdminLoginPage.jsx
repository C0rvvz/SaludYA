import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../../components/AuthShell";
import { iniciarSesionPersonal } from "../../api/admin";
import { usePersonal } from "../../context/personal";

/**
 * Inicio de sesión del personal de la EPS / IPS.
 *
 * A diferencia del prototipo, no se elige el "tipo de usuario": el rol
 * viene de la cuenta (lo asigna un administrador), para que nadie pueda
 * entrar con más permisos de los que tiene.
 */
export default function AdminLoginPage() {
  const { personal, iniciarSesion } = usePersonal();
  const navigate = useNavigate();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (personal) return <Navigate to="/admin/citas" replace />;

  async function ingresar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const respuesta = await iniciarSesionPersonal(correo, password);
      iniciarSesion(respuesta.access_token, respuesta.personal);
      navigate("/admin/citas", { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card__header">
        <p className="auth-card__eyebrow">Acceso para personal</p>
        <h1>Ingreso del personal de la EPS o IPS</h1>
        <p className="auth-card__lead">Su rol y permisos los asigna el administrador de SaludYA.</p>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <form onSubmit={ingresar}>
        <div className="field">
          <label htmlFor="correo">Correo institucional</label>
          <input
            id="correo"
            type="email"
            autoComplete="username"
            placeholder="nombre@institucion.co"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn btn--primary btn--block" type="submit" disabled={enviando}>
          {enviando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>

      <p className="field__hint" style={{ marginTop: "1rem", textAlign: "center" }}>
        ¿Problemas para ingresar? Comuníquese con el administrador de SaludYA en su institución.
      </p>
    </AuthShell>
  );
}
