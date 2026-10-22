import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import VerificacionHumana from "../../components/VerificacionHumana";
import { iniciarSesionPersonal } from "../../api/admin";
import { usePersonal } from "../../context/personal";
import { propsCampoProtegido, propsPantallaProtegida } from "../../utils/campoProtegido";
import { borrarMotivoCierre, leerMotivoCierre } from "../../utils/sesion";
import { llaveVerificacion } from "../../utils/verificacion";

// Foto de ejemplo del diseño (Unsplash, libre de uso): reemplazar por una propia.
const FOTO = "https://unsplash.com/photos/Q3J1wmn7_8w/download?w=1200";

function IconoSobre() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoCandado() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconoOjo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * Acceso del personal de la EPS / IPS (sistema 2a): a la izquierda la
 * presentación de la plataforma; a la derecha correo, contraseña y
 * "No soy un robot". No se elige el "tipo de usuario": el rol viene de la
 * cuenta (lo asigna un administrador), para que nadie entre con más
 * permisos de los que tiene. No hay registro: las cuentas las crea un
 * administrador.
 */
export default function AdminLoginPage() {
  const { personal, iniciarSesion } = usePersonal();
  const navigate = useNavigate();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ayudaClave, setAyudaClave] = useState(false);
  // Por qué se cerró la sesión anterior (inactividad, otra pestaña...), si fue así.
  const [motivoCierre] = useState(() => leerMotivoCierre("personal"));
  const [avisoCampo, setAvisoCampo] = useState("");
  const protegido = propsCampoProtegido(setAvisoCampo);
  // "No soy un robot": el token se gasta en cada intento; `intentos` vuelve a montar la casilla.
  const [verificacion, setVerificacion] = useState(null);
  const [intentos, setIntentos] = useState(0);

  useEffect(() => {
    borrarMotivoCierre("personal");
  }, []);

  if (personal) return <Navigate to="/admin/citas" replace />;

  async function ingresar(evento) {
    evento.preventDefault();
    setError("");
    if (llaveVerificacion() && !verificacion) {
      setError("Marque la casilla «No soy un robot» antes de continuar.");
      return;
    }
    setEnviando(true);
    try {
      const respuesta = await iniciarSesionPersonal(correo, password, verificacion);
      iniciarSesion(respuesta.access_token, respuesta.personal);
      navigate("/admin/citas", { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword("");
    } finally {
      setEnviando(false);
      setVerificacion(null);
      setIntentos((n) => n + 1);
    }
  }

  return (
    <div className="admin-ingreso auth-page--protegida" {...propsPantallaProtegida}>
      <section className="admin-ingreso__presentacion" style={{ "--foto": `url("${FOTO}")` }}>
        <span className="admin-ingreso__marca">
          <span className="admin-ingreso__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
              <path d="M2 12h4l2-7 4 14 2-7h8" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          SaludYA <span className="admin-ingreso__marca-sub">Personal</span>
        </span>
        <div className="admin-ingreso__textos">
          <span className="admin-ingreso__pildora">
            <span className="admin-ingreso__corazon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10Z" fill="#fff" />
              </svg>
            </span>
            Plataforma de gestión de citas
          </span>
          <p className="admin-ingreso__titulo">Acceso para EPS, IPS y consultorios</p>
          <p className="admin-ingreso__texto">
            Administración de agendas, citas, listas de espera y solicitudes en una sola plataforma.
          </p>
        </div>
        <Link to="/" className="admin-ingreso__volver">
          Volver al inicio
        </Link>
      </section>

      <div className="admin-ingreso__lado">
        <div className="admin-ingreso__tarjeta">
          <div>
            <h1>Iniciar sesión</h1>
            <p className="admin-ingreso__lead">Utilice las credenciales asignadas por su institución.</p>
          </div>

          {motivoCierre && <div className="alert alert--info">{motivoCierre}</div>}
          {avisoCampo && <div className="alert alert--error">{avisoCampo}</div>}
          {error && <div className="alert alert--error">{error}</div>}

          <p className="nota-obligatorios">
            Los campos con asterisco (<span className="campo-obligatorio">*</span>) son obligatorios.
          </p>

          <form onSubmit={ingresar} className="admin-ingreso__formulario">
            <div className="field">
              <label htmlFor="correo" className="obligatorio">
                Correo institucional
              </label>
              <div className="campo-icono">
                <IconoSobre />
                <input
                  id="correo"
                  // "text" y no "email": en los campos de correo el navegador no deja
                  // anular la selección de texto (RNF-16).
                  type="text"
                  inputMode="email"
                  aria-required="true"
                  {...protegido}
                  placeholder="nombre@institucion.co"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="password" className="obligatorio">
                Contraseña
              </label>
              <div className="campo-icono">
                <IconoCandado />
                <input
                  id="password"
                  type={verClave ? "text" : "password"}
                  aria-required="true"
                  {...protegido}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="campo-icono__boton"
                  aria-pressed={verClave}
                  onClick={() => setVerClave(!verClave)}
                >
                  <IconoOjo />
                  {verClave ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <VerificacionHumana key={intentos} onToken={setVerificacion} />

            <button className="btn btn--primary btn--block" type="submit" disabled={enviando}>
              {enviando ? "Ingresando..." : "Ingresar"}
            </button>
          </form>

          <button type="button" className="admin-ingreso__olvido" onClick={() => setAyudaClave(!ayudaClave)} aria-expanded={ayudaClave}>
            ¿Olvidó su contraseña?
          </button>
          {ayudaClave && (
            <p className="admin-ingreso__ayuda">
              Por seguridad, la contraseña solo la puede cambiar un administrador de su institución, en{" "}
              <strong>Usuarios → Cambiar contraseña</strong>. Comuníquese con él.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
