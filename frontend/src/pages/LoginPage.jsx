import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import CelularCodigo from "../components/CelularCodigo";
import CodigoCasillas from "../components/CodigoCasillas";
import { Chevron } from "../components/Iconos";
import { identificarPaciente, enviarOtp, reenviarOtp, validarOtp } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { validarNumeroDocumento, validarCodigoOtp } from "../utils/validaciones";
import { propsCampoProtegido } from "../utils/campoProtegido";
import { borrarMotivoCierre, leerMotivoCierre } from "../utils/sesion";

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
 * Ingreso del paciente (HU-01 a HU-04), sistema 2a: solo con el documento
 * y el código de 6 dígitos que llega por WhatsApp, sin contraseñas. En
 * computador, a la izquierda, un celular de muestra donde aparece el
 * código en el modo demostración.
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

    setCargando(true);
    try {
      // HU-01: verificar que la cédula esté registrada
      await identificarPaciente(numeroDocumento);

      // HU-02: generar y enviar el código automáticamente
      const envio = await enviarOtp(numeroDocumento);
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

  const pie = (
    <>
      <p className="auth-tarjeta-pie">
        ¿No tiene cuenta? <Link to="/registrarse">Regístrese</Link>
      </p>
      <Link to="/admin/ingresar" className="auth-acceso-personal">
        <span className="auth-acceso-personal__punto" aria-hidden="true" />
        Acceso para personal de la EPS o IPS
      </Link>
    </>
  );

  return (
    <AuthShell
      protegida
      ancho="angosto"
      lado={<CelularCodigo codigoDemo={paso === "otp" ? codigoDemo : null} telefono={paso === "otp" ? telefonoEnmascarado : null} />}
      pie={paso === "cedula" ? pie : null}
    >
      {motivoCierre && <div className="alert alert--info">{motivoCierre}</div>}
      {avisoCampo && <div className="alert alert--error">{avisoCampo}</div>}

      {paso === "cedula" && (
        <>
          <div className="auth-card__header">
            <h1 className="sr-only">Ingrese su número de documento</h1>
            <p className="auth-card__lead">Entre con su documento. Sin contraseñas.</p>
          </div>

          {noRegistrado && (
            <div className="alert alert--error">
              No se encontró ningún paciente con ese documento.{" "}
              <Link to="/registrarse">Regístrese aquí</Link>.
            </div>
          )}
          {error && <div className="alert alert--error">{error}</div>}

          <form onSubmit={manejarEnvioCedula} noValidate>
            <div className="field">
              <label htmlFor="tipo_documento">Tipo de documento</label>
              <select id="tipo_documento" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)}>
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

            <button className="btn btn--primary btn--block" type="submit" disabled={cargando}>
              {cargando ? "Enviando el código..." : "Enviar código"}
            </button>
          </form>

          <Link to="/#ayuda" className="auth-ayuda">
            ¿Problemas para entrar?
          </Link>
        </>
      )}

      {paso === "otp" && (
        <>
          <button type="button" className="btn-volver auth-card__atras" onClick={volverAlDocumento}>
            <span className="btn__circulo">
              <Chevron hacia="izquierda" />
            </span>
            Cambiar el documento
          </button>

          <div className="auth-card__header auth-card__header--izquierda">
            <h1>Escriba el código</h1>
            <p className="auth-card__lead">
              Lo enviamos al WhatsApp terminado en <strong>{telefonoEnmascarado?.slice(-4)}</strong>.
            </p>
          </div>

          {error && <div className="alert alert--error">{error}</div>}

          {/* En celular no hay celular de muestra: el código de demostración va aquí. */}
          {codigoDemo && (
            <output className="alert alert--demo auth-demo-celular">
              <strong>Modo demostración:</strong> WhatsApp no está conectado, así que mostramos aquí el código que le
              habría llegado: <strong className="codigo-demo">{codigoDemo}</strong>
            </output>
          )}

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
                <p className="field__hint">El código vence a los 5 minutos.</p>
              )}
            </div>

            <p className="auth-reenvio">
              ¿No le llegó?{" "}
              {segundosRestantes > 0 ? (
                <>
                  Reenviar en <strong>{reloj(segundosRestantes)}</strong>
                </>
              ) : (
                <button type="button" className="btn btn--link" onClick={manejarReenvio} disabled={cargando}>
                  Reenviar código
                </button>
              )}
            </p>

            <button className="btn btn--primary btn--block" type="submit" disabled={cargando}>
              {cargando ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
