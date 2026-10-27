import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import CodigoCasillas from "../components/CodigoCasillas";
import EliAvatar from "../components/EliAvatar";
import { Chevron } from "../components/Iconos";
import VerificacionHumana from "../components/VerificacionHumana";
import { identificarPaciente, enviarOtp, reenviarOtp, validarOtp } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { validarNumeroDocumento, validarCodigoOtp } from "../utils/validaciones";
import { propsCampoProtegido } from "../utils/campoProtegido";
import { borrarMotivoCierre, leerMotivoCierre } from "../utils/sesion";
import { llaveVerificacion } from "../utils/verificacion";

const SEGUNDOS_ENFRIAMIENTO = 60; // igual a OTP_REENVIO_SEGUNDOS en el backend

const TIPOS_DOCUMENTO = [
  { value: "cedula_ciudadania", label: "Cédula de ciudadanía" },
  { value: "cedula_extranjeria", label: "Cédula de extranjería" },
  { value: "tarjeta_identidad", label: "Tarjeta de identidad" },
  { value: "pasaporte", label: "Pasaporte" },
];

// 42 -> "0:42"
const reloj = (segundos) => `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

/**
 * Lo que dice Eli: antes de enviar, cómo entrar; después, el código (en el
 * modo de prueba, porque WhatsApp no está conectado) o a dónde lo envió.
 * `compacto`: la versión del celular, dentro de la tarjeta.
 */
function MensajeEli({ paso, codigoDemo, telefono, compacto = false }) {
  if (paso === "otp" && codigoDemo) {
    return (
      <output className={`burbuja burbuja--oscura eli-codigo ${compacto ? "eli-codigo--compacto" : ""}`}>
        <span className="eli-codigo__intro">{compacto ? "Soy Eli. Este es su código:" : "Listo. Este es su código de acceso:"}</span>
        <strong className="eli-codigo__digitos">{codigoDemo}</strong>
        <span className="eli-codigo__nota">Modo de prueba: en el servicio real, este código le llega por WhatsApp.</span>
      </output>
    );
  }
  if (paso === "otp") {
    return (
      <p className="burbuja">
        Listo. Enviamos el código por WhatsApp a su celular terminado en <strong>{telefono?.slice(-4)}</strong>.
      </p>
    );
  }
  return compacto ? (
    <p className="burbuja">Escriba su número de documento y le enviaremos un código por WhatsApp. No necesita contraseña.</p>
  ) : (
    <p className="burbuja">
      Hola, soy <strong>Eli</strong>. Escriba su número de documento y presione <strong>Enviar código</strong>. Le
      enviaremos un código por WhatsApp para iniciar sesión.
    </p>
  );
}

function EliIngreso(props) {
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
        <div className="flota" key={`${props.paso}-${props.codigoDemo}`}>
          <MensajeEli {...props} />
        </div>
      </div>
    </div>
  );
}

/**
 * Ingreso del paciente (HU-01 a HU-04), sistema 2a: solo con el documento
 * y el código de 6 dígitos que llega por WhatsApp, sin contraseñas, y la
 * casilla "No soy un robot". Eli acompaña: a la izquierda en computador y
 * dentro de la tarjeta en el celular.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { iniciarSesion } = useAuth();

  const [paso, setPaso] = useState("cedula"); // "cedula" | "otp"
  const [tipoDocumento, setTipoDocumento] = useState("cedula_ciudadania");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [codigo, setCodigo] = useState("");
  const [telefonoEnmascarado, setTelefonoEnmascarado] = useState("");
  // Por qué se cerró la sesión anterior (inactividad, otra pestaña...), si fue así.
  const [motivoCierre] = useState(() => leerMotivoCierre("paciente"));
  const [avisoCampo, setAvisoCampo] = useState("");
  const protegido = propsCampoProtegido(setAvisoCampo);
  // "No soy un robot": el token se gasta en cada envío; `intentos` vuelve a montar la casilla.
  const [verificacion, setVerificacion] = useState(null);
  const [intentos, setIntentos] = useState(0);
  // Modo demostración: el backend solo lo envía con WhatsApp simulado y en desarrollo.
  const [codigoDemo, setCodigoDemo] = useState(null);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [noRegistrado, setNoRegistrado] = useState(false);
  const [errorDocumento, setErrorDocumento] = useState("");
  const [errorCodigo, setErrorCodigo] = useState("");

  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    borrarMotivoCierre("paciente");
    return () => clearInterval(intervalRef.current);
  }, []);

  function iniciarEnfriamiento() {
    setSegundosRestantes(SEGUNDOS_ENFRIAMIENTO);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSegundosRestantes((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function manejarEnvioCedula(evento) {
    evento.preventDefault();
    setError("");
    setNoRegistrado(false);

    const mensajeError = validarNumeroDocumento(numeroDocumento, tipoDocumento);
    setErrorDocumento(mensajeError);
    if (mensajeError) return;
    if (llaveVerificacion() && !verificacion) {
      setError("Marque la casilla «No soy un robot» antes de continuar.");
      return;
    }

    setCargando(true);
    try {
      // HU-01: verificar que la cédula esté registrada
      await identificarPaciente(numeroDocumento);

      // HU-02: generar y enviar el código automáticamente
      const envio = await enviarOtp(numeroDocumento, verificacion);
      setTelefonoEnmascarado(envio.telefono_enmascarado);
      setCodigoDemo(envio.codigo_demo);
      iniciarEnfriamiento();
      setPaso("otp");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNoRegistrado(true);
      } else {
        setError(err.message);
      }
    } finally {
      setCargando(false);
      // El token ya se usó (o se intentó usar): la casilla empieza de nuevo.
      setVerificacion(null);
      setIntentos((n) => n + 1);
    }
  }

  async function manejarReenvio() {
    if (segundosRestantes > 0) return;
    setError("");
    setCargando(true);
    try {
      const envio = await reenviarOtp(numeroDocumento);
      setTelefonoEnmascarado(envio.telefono_enmascarado);
      setCodigoDemo(envio.codigo_demo);
      iniciarEnfriamiento();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function manejarValidacion(evento) {
    evento.preventDefault();
    setError("");

    const mensajeError = validarCodigoOtp(codigo);
    setErrorCodigo(mensajeError);
    if (mensajeError) return;

    setCargando(true);
    try {
      const resultado = await validarOtp(numeroDocumento, codigo);
      await iniciarSesion(resultado.access_token);
      navigate("/panel");
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function volverAlDocumento() {
    setPaso("cedula");
    setCodigo("");
    setError("");
    setErrorCodigo("");
  }

  const eli = { paso, codigoDemo, telefono: telefonoEnmascarado };

  return (
    <AuthShell
      protegida
      ancho="angosto"
      lado={<EliIngreso {...eli} />}
      pie={
        paso === "cedula" ? (
          <p className="auth-tarjeta-pie">
            ¿No tiene cuenta? <Link to="/registrarse">Regístrese</Link>
          </p>
        ) : null
      }
    >
      {motivoCierre && <div className="alert alert--info">{motivoCierre}</div>}
      {avisoCampo && <div className="alert alert--error">{avisoCampo}</div>}

      {paso === "cedula" && (
        <>
          <div className="auth-card__header">
            <h1 className="sr-only">Ingrese su número de documento</h1>
            <p className="auth-card__lead">Inicie sesión con su número de documento, sin contraseña.</p>
          </div>

          {/* En el celular, Eli va dentro de la tarjeta */}
          <div className="eli-compacto">
            <EliAvatar tamano={44} />
            <MensajeEli {...eli} compacto />
          </div>

          {noRegistrado && (
            <div className="alert alert--error">
              No hay ninguna cuenta registrada con ese documento. <Link to="/registrarse">Cree su cuenta aquí</Link>.
            </div>
          )}
          {error && <div className="alert alert--error">{error}</div>}

          <p className="nota-obligatorios">
            Los campos marcados con asterisco (<span className="campo-obligatorio">*</span>) son obligatorios.
          </p>

          <form onSubmit={manejarEnvioCedula} noValidate>
            <div className="field">
              <label htmlFor="tipo_documento" className="obligatorio">
                Tipo de documento
              </label>
              <select
                id="tipo_documento"
                aria-required="true"
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value)}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="numero_documento" className="obligatorio">
                Número de documento
              </label>
              <input
                id="numero_documento"
                type="text"
                aria-required="true"
                // Único caso con letras: el pasaporte (p. ej. AV123456).
                // Los demás tipos de documento son siempre numéricos, así
                // que ahí sí mostramos el teclado numérico en celular.
                inputMode={tipoDocumento === "pasaporte" ? "text" : "numeric"}
                className={errorDocumento ? "has-error" : ""}
                aria-invalid={Boolean(errorDocumento)}
                {...protegido}
                value={numeroDocumento}
                onChange={(e) => {
                  setNumeroDocumento(e.target.value);
                  if (errorDocumento) setErrorDocumento("");
                }}
                placeholder={tipoDocumento === "pasaporte" ? "Ej. AV123456" : "Ej. 1038456210"}
              />
              {errorDocumento && <p className="field__error">{errorDocumento}</p>}
            </div>

            <VerificacionHumana key={intentos} onToken={setVerificacion} />

            <button className="btn btn--primary btn--block" type="submit" disabled={cargando}>
              {cargando ? "Enviando el código..." : "Enviar código"}
            </button>
          </form>

          <Link to="/#ayuda" className="auth-ayuda">
            ¿Problemas para iniciar sesión?
          </Link>
        </>
      )}

      {paso === "otp" && (
        <>
          <button type="button" className="btn-volver auth-card__atras" onClick={volverAlDocumento}>
            <span className="btn__circulo">
              <Chevron hacia="izquierda" />
            </span>
            Atrás
          </button>

          <div className="auth-card__header auth-card__header--izquierda">
            <h1>Escriba el código de verificación</h1>
            <p className="auth-card__lead">
              Lo enviamos por WhatsApp a su celular terminado en <strong>{telefonoEnmascarado?.slice(-4)}</strong>.
            </p>
          </div>

          <div className="eli-compacto">
            <EliAvatar tamano={44} />
            <div className="flota">
              <MensajeEli {...eli} compacto />
            </div>
          </div>

          {error && <div className="alert alert--error">{error}</div>}

          <form onSubmit={manejarValidacion} noValidate>
            <div className="field">
              <label htmlFor="codigo">Código de verificación</label>
              <CodigoCasillas
                id="codigo"
                valor={codigo}
                error={errorCodigo}
                props={protegido}
                onCambio={(valor) => {
                  setCodigo(valor);
                  if (errorCodigo) setErrorCodigo("");
                }}
              />
              {errorCodigo ? (
                <p className="field__error">{errorCodigo}</p>
              ) : (
                <p className="field__hint">El código vence en 5 minutos.</p>
              )}
            </div>

            <p className="auth-reenvio">
              ¿No le llegó?{" "}
              {segundosRestantes > 0 ? (
                <>
                  Podrá pedir otro en <strong>{reloj(segundosRestantes)}</strong>
                </>
              ) : (
                <button type="button" className="btn btn--link" onClick={manejarReenvio} disabled={cargando}>
                  Reenviar código
                </button>
              )}
            </p>

            <button className="btn btn--primary btn--block" type="submit" disabled={cargando}>
              {cargando ? "Iniciando sesión…" : "Iniciar sesión"}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
