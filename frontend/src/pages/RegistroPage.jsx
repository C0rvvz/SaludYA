import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import ModalTratamientoDatos from "../components/ModalTratamientoDatos";
import { registrarPaciente } from "../api/pacientes";
import { listarEps } from "../api/eps";
import {
  validarNumeroDocumento,
  validarNombre,
  validarTelefonoWhatsapp,
  validarCorreo,
} from "../utils/validaciones";

const TIPOS_DOCUMENTO = [
  { value: "cedula_ciudadania", label: "Cédula de ciudadanía" },
  { value: "cedula_extranjeria", label: "Cédula de extranjería" },
  { value: "tarjeta_identidad", label: "Tarjeta de identidad" },
  { value: "pasaporte", label: "Pasaporte" },
];

const ERRORES_CAMPO_VACIOS = {
  numero_documento: "",
  nombre: "",
  telefono_whatsapp: "",
  correo: "",
  eps_id: "",
};

export default function RegistroPage() {
  const navigate = useNavigate();

  const [paso, setPaso] = useState(1); // 1: datos, 2: eps/tratamiento, 3: resultado
  const [epsDisponibles, setEpsDisponibles] = useState([]);
  const [errorEps, setErrorEps] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [modalTratamientoAbierto, setModalTratamientoAbierto] = useState(false);
  const [erroresCampo, setErroresCampo] = useState(ERRORES_CAMPO_VACIOS);

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
      .catch((err) =>
        setErrorEps(
          err?.message || "No fue posible cargar el listado de EPS. Intenta recargar la página."
        )
      );
  }, []);

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    // El error de un campo se limpia apenas la persona vuelve a
    // escribir en él, en vez de dejarlo marcado hasta el próximo envío.
    if (erroresCampo[campo]) {
      setErroresCampo((prev) => ({ ...prev, [campo]: "" }));
    }
  }

  function validarPaso1() {
    const errores = {
      numero_documento: validarNumeroDocumento(form.numero_documento, form.tipo_documento),
      nombre: validarNombre(form.nombre),
      telefono_whatsapp: validarTelefonoWhatsapp(form.telefono_whatsapp),
      correo: validarCorreo(form.correo),
    };
    setErroresCampo((prev) => ({ ...prev, ...errores }));
    return Object.values(errores).every((mensaje) => !mensaje);
  }

  function irAPaso2(evento) {
    evento.preventDefault();
    setError("");
    if (!validarPaso1()) return;
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
      const mensaje = err.message;
      // Si el backend rechazó el documento (p. ej. ya está registrado)
      // o la EPS, se vuelve al paso donde vive ese campo y se marca
      // ahí mismo -- en vez de dejar el error genérico "flotando" en
      // un paso donde el paciente ya no ve el campo que falló.
      if (mensaje.toLowerCase().includes("documento")) {
        setErroresCampo((prev) => ({ ...prev, numero_documento: mensaje }));
        setPaso(1);
      } else if (mensaje.toLowerCase().includes("eps")) {
        setErroresCampo((prev) => ({ ...prev, eps_id: mensaje }));
      } else {
        setError(mensaje);
      }
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
            <h1>Indique sus datos personales</h1>
            <p className="auth-card__lead">Estos datos quedarán asociados a su cuenta.</p>
          </div>

          <form onSubmit={irAPaso2} noValidate>
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
                // Único caso con letras: el pasaporte (p. ej. AV123456).
                // Los demás tipos de documento son siempre numéricos, así
                // que ahí sí mostramos el teclado numérico en celular.
                inputMode={form.tipo_documento === "pasaporte" ? "text" : "numeric"}
                className={erroresCampo.numero_documento ? "has-error" : ""}
                aria-invalid={Boolean(erroresCampo.numero_documento)}
                value={form.numero_documento}
                onChange={(e) => actualizarCampo("numero_documento", e.target.value)}
                placeholder={form.tipo_documento === "pasaporte" ? "Ej. AV123456" : "Ej. 1038456210"}
              />
              {erroresCampo.numero_documento && (
                <p className="field__error">{erroresCampo.numero_documento}</p>
              )}
            </div>

            <div className="field">
              <label htmlFor="nombre">Nombre completo</label>
              <input
                id="nombre"
                type="text"
                className={erroresCampo.nombre ? "has-error" : ""}
                aria-invalid={Boolean(erroresCampo.nombre)}
                value={form.nombre}
                onChange={(e) => actualizarCampo("nombre", e.target.value)}
              />
              {erroresCampo.nombre && <p className="field__error">{erroresCampo.nombre}</p>}
            </div>

            <div className="field">
              <label htmlFor="telefono_whatsapp">WhatsApp</label>
              <input
                id="telefono_whatsapp"
                type="tel"
                inputMode="numeric"
                className={erroresCampo.telefono_whatsapp ? "has-error" : ""}
                aria-invalid={Boolean(erroresCampo.telefono_whatsapp)}
                value={form.telefono_whatsapp}
                onChange={(e) => actualizarCampo("telefono_whatsapp", e.target.value)}
                placeholder="3001234567"
              />
              {erroresCampo.telefono_whatsapp ? (
                <p className="field__error">{erroresCampo.telefono_whatsapp}</p>
              ) : (
                <p className="field__hint">
                  A este número se enviará el código para iniciar sesión.
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="correo">Correo (opcional)</label>
              <input
                id="correo"
                type="email"
                className={erroresCampo.correo ? "has-error" : ""}
                aria-invalid={Boolean(erroresCampo.correo)}
                value={form.correo}
                onChange={(e) => actualizarCampo("correo", e.target.value)}
              />
              {erroresCampo.correo && <p className="field__error">{erroresCampo.correo}</p>}
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
            <h1>Su EPS y autorización</h1>
            <p className="auth-card__lead">Último paso antes de crear su cuenta.</p>
          </div>

          <form onSubmit={enviarRegistro} noValidate>
            <div className="field">
              <label htmlFor="eps_id">Su EPS</label>
              <select
                id="eps_id"
                className={erroresCampo.eps_id ? "has-error" : ""}
                aria-invalid={Boolean(erroresCampo.eps_id)}
                value={form.eps_id}
                onChange={(e) => actualizarCampo("eps_id", e.target.value)}
              >
                <option value="" disabled>
                  Seleccione su EPS
                </option>
                {epsDisponibles.map((eps) => (
                  <option key={eps.id} value={eps.id}>
                    {eps.nombre}
                  </option>
                ))}
              </select>
              {erroresCampo.eps_id && <p className="field__error">{erroresCampo.eps_id}</p>}
              {!erroresCampo.eps_id && errorEps && <p className="field__error">{errorEps}</p>}
            </div>

            <div className="field field--checkbox">
              <input
                id="acepto_tratamiento_datos"
                type="checkbox"
                checked={form.acepto_tratamiento_datos}
                onChange={(e) => actualizarCampo("acepto_tratamiento_datos", e.target.checked)}
              />
              <label htmlFor="acepto_tratamiento_datos">
                He leído y acepto el{" "}
                <button
                  type="button"
                  className="link-inline"
                  onClick={() => setModalTratamientoAbierto(true)}
                >
                  tratamiento de mis datos personales
                </button>{" "}
                por parte de SaludYA.
              </label>
            </div>
            {!form.acepto_tratamiento_datos && (
              <p className="field__hint" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
                Debes aceptarlo para poder crear la cuenta.
              </p>
            )}

            <button
              className="btn btn--primary btn--block"
              type="submit"
              disabled={cargando || !form.eps_id || !form.acepto_tratamiento_datos}
            >
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
            <h1>¡Registro exitoso, {form.nombre.split(" ")[0]}!</h1>
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
          ¿Ya tiene una cuenta? <Link to="/iniciar-sesion">Inicie sesión</Link>
        </p>
      )}

      {modalTratamientoAbierto && (
        <ModalTratamientoDatos onClose={() => setModalTratamientoAbierto(false)} />
      )}
    </AuthShell>
  );
}