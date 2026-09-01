import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { registrarPaciente } from "../api/pacientes";
import { listarEps } from "../api/eps";

const TIPOS_DOCUMENTO = [
  { value: "cedula_ciudadania", label: "Cédula de ciudadanía" },
  { value: "cedula_extranjeria", label: "Cédula de extranjería" },
  { value: "tarjeta_identidad", label: "Tarjeta de identidad" },
  { value: "pasaporte", label: "Pasaporte" },
];

export default function RegistroPage() {
  const navigate = useNavigate();

  const [paso, setPaso] = useState(1); // 1: datos, 2: eps/tratamiento, 3: resultado
  const [epsDisponibles, setEpsDisponibles] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  const [form, setForm] = useState({
    tipo_documento: "cedula_ciudadania",
    numero_documento: "",
    nombre: "",
    telefono_whatsapp: "",
    correo: "",
    eps_id: "",
    acepto_tratamiento_datos: false,
  });

  useEffect(() => {
    listarEps()
      .then(setEpsDisponibles)
      .catch(() => setError("No pudimos cargar el listado de EPS. Intenta recargar la página."));
  }, []);

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function irAPaso2(evento) {
    evento.preventDefault();
    setPaso(2);
  }

  async function enviarRegistro(evento) {
    evento.preventDefault();
    setError("");
    setCargando(true);
    try {
      const datos = { ...form, correo: form.correo.trim() === "" ? null : form.correo };
      const resp = await registrarPaciente(datos);
      setResultado(resp);
      setPaso(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthShell>
      {paso < 3 && (
        <div className="steps">
          <div className={`steps__item ${paso >= 1 ? "is-active" : ""}`} />
          <div className={`steps__item ${paso >= 2 ? "is-active" : ""}`} />
        </div>
      )}

      {error && <div className="alert alert--error">{error}</div>}

      {paso === 1 && (
        <>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Crear cuenta</p>
            <h1>Cuéntanos quién eres</h1>
            <p className="auth-card__lead">Estos datos quedan asociados a tu cuenta.</p>
          </div>

          <form onSubmit={irAPaso2}>
            <div className="field">
              <label htmlFor="tipo_documento">Tipo de documento</label>
              <select
                id="tipo_documento"
                value={form.tipo_documento}
                onChange={(e) => actualizarCampo("tipo_documento", e.target.value)}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="numero_documento">Número de documento</label>
              <input
                id="numero_documento"
                type="text"
                inputMode="numeric"
                value={form.numero_documento}
                onChange={(e) => actualizarCampo("numero_documento", e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="nombre">Nombre completo</label>
              <input
                id="nombre"
                type="text"
                value={form.nombre}
                onChange={(e) => actualizarCampo("nombre", e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="telefono_whatsapp">WhatsApp</label>
              <input
                id="telefono_whatsapp"
                type="tel"
                inputMode="numeric"
                value={form.telefono_whatsapp}
                onChange={(e) => actualizarCampo("telefono_whatsapp", e.target.value)}
                placeholder="3001234567"
                required
              />
              <p className="field__hint">
                Ahí te vamos a mandar el código para iniciar sesión.
              </p>
            </div>

            <div className="field">
              <label htmlFor="correo">Correo (opcional)</label>
              <input
                id="correo"
                type="email"
                value={form.correo}
                onChange={(e) => actualizarCampo("correo", e.target.value)}
              />
            </div>

            <button className="btn btn--primary btn--block" type="submit">
              Continuar
            </button>
          </form>
        </>
      )}

      {paso === 2 && (
        <>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Crear cuenta</p>
            <h1>Tu EPS y autorización</h1>
            <p className="auth-card__lead">Último paso antes de crear tu cuenta.</p>
          </div>

          <form onSubmit={enviarRegistro}>
            <div className="field">
              <label htmlFor="eps_id">Tu EPS</label>
              <select
                id="eps_id"
                value={form.eps_id}
                onChange={(e) => actualizarCampo("eps_id", e.target.value)}
                required
              >
                <option value="" disabled>
                  Selecciona tu EPS
                </option>
                {epsDisponibles.map((eps) => (
                  <option key={eps.id} value={eps.id}>
                    {eps.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="field field--checkbox">
              <input
                id="acepto_tratamiento_datos"
                type="checkbox"
                checked={form.acepto_tratamiento_datos}
                onChange={(e) => actualizarCampo("acepto_tratamiento_datos", e.target.checked)}
                required
              />
              <label htmlFor="acepto_tratamiento_datos">
                He leído y acepto el tratamiento de mis datos personales por
                parte de SaludYA, de acuerdo con la política de privacidad.
              </label>
            </div>

            <button className="btn btn--primary btn--block" type="submit" disabled={cargando}>
              {cargando ? "Creando cuenta..." : "Crear mi cuenta"}
            </button>
            <button
              type="button"
              className="btn btn--link"
              onClick={() => setPaso(1)}
              style={{ marginTop: "1rem" }}
            >
              ← Volver
            </button>
          </form>
        </>
      )}

      {paso === 3 && resultado && (
        <>
          <div className="auth-card__header">
            <h1>¡Listo, {form.nombre.split(" ")[0]}!</h1>
            <p className="auth-card__lead">{resultado.mensaje}</p>
          </div>

          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <div className="summary-row">
              <span className="summary-row__label">Documento</span>
              <span className="summary-row__value">{resultado.numero_documento}</span>
            </div>
            <div className="summary-row">
              <span className="summary-row__label">EPS</span>
              <span className="summary-row__value">{resultado.eps.nombre}</span>
            </div>
            <div className="summary-row">
              <span className="summary-row__label">Afiliación</span>
              <span className="summary-row__value">
                {resultado.estado_afiliacion === "activa" ? (
                  <span className="badge badge--success">Activa</span>
                ) : (
                  <span className="badge badge--warning">No encontrada</span>
                )}
              </span>
            </div>
          </div>

          <button className="btn btn--primary btn--block" onClick={() => navigate("/iniciar-sesion")}>
            Iniciar sesión
          </button>
        </>
      )}

      {paso < 3 && (
        <p style={{ marginTop: "1.5rem", fontSize: "var(--text-sm)", textAlign: "center" }}>
          ¿Ya tienes cuenta? <Link to="/iniciar-sesion">Inicia sesión</Link>
        </p>
      )}
    </AuthShell>
  );
}
