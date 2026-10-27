import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import EliAvatar from "../components/EliAvatar";
import { Chevron } from "../components/Iconos";
import ModalTratamientoDatos from "../components/ModalTratamientoDatos";
import VerificacionHumana from "../components/VerificacionHumana";
import { registrarPaciente } from "../api/pacientes";
import { listarEps } from "../api/eps";
import {
  validarNumeroDocumento,
  validarNombre,
  validarTelefonoWhatsapp,
  validarCorreo,
} from "../utils/validaciones";
import { llaveVerificacion } from "../utils/verificacion";

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

// Lo que dice Eli en cada paso (a la izquierda, en computador).
const MENSAJES_ELI = {
  1: [
    <>
      Hola, soy <strong>Eli</strong>. Le acompañaré mientras crea su cuenta.
    </>,
    <>
      Escriba sus datos y el número de celular en el que tiene WhatsApp. A ese número le enviaremos un código
      para iniciar sesión: <strong>no necesita contraseña</strong>.
    </>,
  ],
  2: [
    <>Muy bien, ya casi terminamos.</>,
    <>
      Seleccione su <strong>EPS</strong>. Si no tiene EPS y es atendido por médicos particulares, marque{" "}
      <strong>No tengo EPS</strong>. Luego acepte el tratamiento de sus datos personales y marque la casilla{" "}
      <strong>No soy un robot</strong>.
    </>,
  ],
};

function EliRegistro({ paso }) {
  return (
    <div className="eli-registro">
      <div className="eli-registro__quien">
        <EliAvatar tamano={150} grande />
        <div>
          <p className="eli-registro__nombre">Eli</p>
          <p className="eli-registro__rol">Su guía de SaludYA</p>
        </div>
      </div>
      <div className="eli-registro__burbujas">
        {MENSAJES_ELI[paso].map((mensaje, i) => (
          <div key={`${paso}-${i}`} className={`flota ${i ? "flota--2" : ""}`}>
            <p className="burbuja">{mensaje}</p>
          </div>
        ))}
      </div>
      <ol className="pasos-registro">
        {["Datos personales", "EPS y autorización"].map((nombre, i) => {
          const numero = i + 1;
          const estado = numero < paso ? "is-hecho" : numero === paso ? "is-actual" : "";
          return (
            <li key={nombre} className={`pasos-registro__paso ${estado}`} aria-current={numero === paso ? "step" : undefined}>
              <span className="pasos-registro__numero" aria-hidden="true">
                {numero < paso ? "✓" : numero}
              </span>
              {nombre}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Registro del paciente (HU-05 a HU-08), sistema 2a: dos pasos y la
 * confirmación. En computador, Eli acompaña a la izquierda.
 */
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
  // "No soy un robot": el token se gasta en cada envío; `intentos` vuelve a montar la casilla.
  const [verificacion, setVerificacion] = useState(null);
  const [intentos, setIntentos] = useState(0);

  const [form, setForm] = useState({
    tipo_documento: "cedula_ciudadania",
    numero_documento: "",
    nombre: "",
    telefono_whatsapp: "",
    correo: "",
    eps_id: "",
    sin_eps: false, // no tiene EPS: se atiende con médicos particulares
    acepto_tratamiento_datos: false,
  });

  useEffect(() => {
    listarEps()
      .then(setEpsDisponibles)
      .catch((err) =>
        setErrorEps(err?.message || "No fue posible cargar la lista de EPS. Recargue la página e intente de nuevo.")
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
    if (llaveVerificacion() && !verificacion) {
      setError("Marque la casilla «No soy un robot» antes de continuar.");
      return;
    }
    setCargando(true);
    try {
      const { sin_eps: sinEps, ...campos } = form;
      const datos = {
        ...campos,
        correo: form.correo.trim() === "" ? null : form.correo,
        eps_id: sinEps ? null : form.eps_id, // null: particular, sin EPS
      };
      const resp = await registrarPaciente(datos, verificacion);
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
      // El token de "No soy un robot" ya se usó: la casilla empieza de nuevo.
      setVerificacion(null);
      setIntentos((n) => n + 1);
    }
  }

  const pie =
    paso < 3 ? (
      <p className="auth-tarjeta-pie">
        ¿Ya tiene cuenta? <Link to="/iniciar-sesion">Inicie sesión</Link>
      </p>
    ) : null;

  return (
    <AuthShell lado={paso < 3 ? <EliRegistro paso={paso} /> : null} pie={pie}>
      {paso < 3 && (
        <>
          <p className="auth-card__lead auth-card__lead--centro">
            {paso === 1 ? "Cree su cuenta en dos pasos." : "Último paso: su EPS y la autorización de sus datos."}
          </p>
          <div className="steps" aria-label={`Paso ${paso} de 2`}>
            <div className={`steps__item ${paso >= 1 ? "is-active" : ""}`} />
            <div className={`steps__item ${paso >= 2 ? "is-active" : ""}`} />
          </div>
        </>
      )}

      {error && <div className="alert alert--error">{error}</div>}

      {paso < 3 && (
        <p className="nota-obligatorios">
          Los campos marcados con asterisco (<span className="campo-obligatorio">*</span>) son obligatorios. Los
          marcados como <strong>(opcional)</strong> puede dejarlos vacíos.
        </p>
      )}

      {paso === 1 && (
        <>
          <h1 className="sr-only">Indique sus datos personales</h1>
          <form onSubmit={irAPaso2} noValidate>
            <div className="campos-dobles">
              <div className="field">
                <label htmlFor="tipo_documento" className="obligatorio">Tipo de documento</label>
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
                <label htmlFor="numero_documento" className="obligatorio">Número de documento</label>
                <input
                  id="numero_documento"
                  type="text"
                  // Único caso con letras: el pasaporte (p. ej. AV123456).
                  inputMode={form.tipo_documento === "pasaporte" ? "text" : "numeric"}
                  className={erroresCampo.numero_documento ? "has-error" : ""}
                  aria-invalid={Boolean(erroresCampo.numero_documento)}
                  value={form.numero_documento}
                  onChange={(e) => actualizarCampo("numero_documento", e.target.value)}
                  placeholder={form.tipo_documento === "pasaporte" ? "Ej. AV123456" : "Ej. 1038456210"}
                />
                {erroresCampo.numero_documento && <p className="field__error">{erroresCampo.numero_documento}</p>}
              </div>
            </div>

            <div className="field">
              <label htmlFor="nombre" className="obligatorio">Nombre completo</label>
              <input
                id="nombre"
                type="text"
                autoComplete="name"
                className={erroresCampo.nombre ? "has-error" : ""}
                aria-invalid={Boolean(erroresCampo.nombre)}
                value={form.nombre}
                onChange={(e) => actualizarCampo("nombre", e.target.value)}
              />
              {erroresCampo.nombre && <p className="field__error">{erroresCampo.nombre}</p>}
            </div>

            <div className="field">
              <label htmlFor="telefono_whatsapp" className="obligatorio">Celular con WhatsApp</label>
              <input
                id="telefono_whatsapp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                className={erroresCampo.telefono_whatsapp ? "has-error" : ""}
                aria-invalid={Boolean(erroresCampo.telefono_whatsapp)}
                value={form.telefono_whatsapp}
                onChange={(e) => actualizarCampo("telefono_whatsapp", e.target.value)}
                placeholder="300 123 4567"
              />
              {erroresCampo.telefono_whatsapp ? (
                <p className="field__error">{erroresCampo.telefono_whatsapp}</p>
              ) : (
                <p className="field__hint">A este celular le enviaremos el código para poder iniciar sesión.</p>
              )}
            </div>

            <div className="field">
              <label htmlFor="correo">Correo electrónico <span className="opcional">(opcional)</span></label>
              <input
                id="correo"
                type="email"
                autoComplete="email"
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
          <h1 className="sr-only">Su EPS y autorización</h1>
          <form onSubmit={enviarRegistro} noValidate>
            <div className="field">
              <label htmlFor="eps_id" className="obligatorio">Su EPS</label>
              <select
                id="eps_id"
                className={erroresCampo.eps_id ? "has-error" : ""}
                aria-invalid={Boolean(erroresCampo.eps_id)}
                value={form.eps_id}
                disabled={form.sin_eps}
                onChange={(e) => actualizarCampo("eps_id", e.target.value)}
              >
                <option value="" disabled>
                  {form.sin_eps ? "Sin EPS (atención particular)" : "Seleccione su EPS"}
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

            {/* A la vista, fuera de la lista: quien no tiene EPS no tendría por qué buscarlo adentro. */}
            <div className="field field--checkbox">
              <input
                id="sin_eps"
                type="checkbox"
                checked={form.sin_eps}
                onChange={(e) => {
                  actualizarCampo("sin_eps", e.target.checked);
                  if (e.target.checked) actualizarCampo("eps_id", "");
                }}
              />
              <label htmlFor="sin_eps">No tengo EPS y soy atendido por médicos particulares</label>
            </div>
            {form.sin_eps && (
              <p className="field__hint" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
                Sus citas serán particulares: la consulta y los medicamentos tienen costo.
              </p>
            )}

            <div className="field field--checkbox">
              <input
                id="acepto_tratamiento_datos"
                aria-required="true"
                type="checkbox"
                checked={form.acepto_tratamiento_datos}
                onChange={(e) => actualizarCampo("acepto_tratamiento_datos", e.target.checked)}
              />
              <label htmlFor="acepto_tratamiento_datos">
                He leído y acepto el{" "}
                <button type="button" className="link-inline" onClick={() => setModalTratamientoAbierto(true)}>
                  tratamiento de mis datos personales
                </button>{" "}
                por parte de SaludYA. <span className="campo-obligatorio">*</span>
              </label>
            </div>
            {!form.acepto_tratamiento_datos && (
              <p className="field__hint" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
                Es necesario aceptarlo para crear su cuenta.
              </p>
            )}

            <VerificacionHumana key={intentos} onToken={setVerificacion} />

            <button
              className="btn btn--primary btn--block"
              type="submit"
              disabled={cargando || (!form.eps_id && !form.sin_eps) || !form.acepto_tratamiento_datos}
            >
              {cargando ? "Creando su cuenta…" : "Crear mi cuenta"}
            </button>
            <div className="auth-card__centro">
              <button type="button" className="btn-volver" onClick={() => setPaso(1)}>
                <span className="btn__circulo">
                  <Chevron hacia="izquierda" />
                </span>
                Volver al paso anterior
              </button>
            </div>
          </form>
        </>
      )}

      {paso === 3 && resultado && (
        <div className="registro-exito">
          <span className="registro-exito__check" aria-hidden="true">
            ✓
          </span>
          <h1>Su cuenta está lista, {form.nombre.split(" ")[0]}</h1>
          <p className="auth-card__lead">{resultado.mensaje}</p>

          <div className="registro-exito__datos">
            <div className="summary-row">
              <span className="summary-row__label">Documento</span>
              <span className="summary-row__value">{resultado.numero_documento}</span>
            </div>
            <div className="summary-row">
              <span className="summary-row__label">EPS</span>
              <span className="summary-row__value">{resultado.eps?.nombre ?? "Particular (sin EPS)"}</span>
            </div>
            <div className="summary-row">
              <span className="summary-row__label">Estado de la afiliación</span>
              <span className="summary-row__value">
                {resultado.estado_afiliacion === "activa" ? (
                  <span className="badge badge--success">Activa</span>
                ) : resultado.estado_afiliacion === "particular" ? (
                  <span className="badge badge--neutral">No aplica</span>
                ) : (
                  <span className="badge badge--warning">No encontrada</span>
                )}
              </span>
            </div>
          </div>

          <button className="btn btn--primary btn--block" onClick={() => navigate("/iniciar-sesion")}>
            Iniciar sesión
          </button>
        </div>
      )}

      {modalTratamientoAbierto && <ModalTratamientoDatos onClose={() => setModalTratamientoAbierto(false)} />}
    </AuthShell>
  );
}
