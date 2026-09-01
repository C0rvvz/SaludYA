import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { identificarPaciente, enviarOtp, reenviarOtp, validarOtp } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

const SEGUNDOS_ENFRIAMIENTO = 60; // igual a OTP_REENVIO_SEGUNDOS en el backend

export default function LoginPage() {
  const navigate = useNavigate();
  const { iniciarSesion } = useAuth();

  const [paso, setPaso] = useState("cedula"); // "cedula" | "otp"
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [codigo, setCodigo] = useState("");
  const [telefonoEnmascarado, setTelefonoEnmascarado] = useState("");
  const [nombrePaciente, setNombrePaciente] = useState("");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [noRegistrado, setNoRegistrado] = useState(false);

  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
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
    setCargando(true);
    try {
      // HU-01: verificar que la cédula esté registrada
      const identificacion = await identificarPaciente(numeroDocumento);
      setNombrePaciente(identificacion.nombre);

      // HU-02: generar y enviar el código automáticamente
      const envio = await enviarOtp(numeroDocumento);
      setTelefonoEnmascarado(envio.telefono_enmascarado);
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

  return (
    <AuthShell>

      {paso === "cedula" && (
        <>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Iniciar sesión</p>
            <h1>Ingresa tu número de documento</h1>
            <p className="auth-card__lead">
              Te vamos a enviar un código de verificación por WhatsApp — no
              necesitas contraseña.
            </p>
          </div>

          {noRegistrado && (
            <div className="alert alert--error">
              No encontramos ningún paciente con ese documento.{" "}
              <Link to="/registrarse">Regístrate aquí</Link>.
            </div>
          )}
          {error && <div className="alert alert--error">{error}</div>}

          <form onSubmit={manejarEnvioCedula}>
            <div className="field">
              <label htmlFor="numero_documento">Número de documento</label>
              <input
                id="numero_documento"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
                placeholder="Ej. 1038456210"
                required
              />
            </div>

            <button className="btn btn--primary btn--block" type="submit" disabled={cargando}>
              {cargando ? "Verificando..." : "Continuar"}
            </button>
          </form>
        </>
      )}

      {paso === "otp" && (
        <>
          <div className="auth-card__header">
            <p className="auth-card__eyebrow">Iniciar sesión</p>
            <h1>Ingresa el código</h1>
            <p className="auth-card__lead">
              Hola {nombrePaciente}, enviamos un código de 6 dígitos a tu WhatsApp
              terminado en <strong>{telefonoEnmascarado?.slice(-4)}</strong>.
            </p>
          </div>

          {error && <div className="alert alert--error">{error}</div>}

          <form onSubmit={manejarValidacion}>
            <div className="field">
              <label htmlFor="codigo">Código de verificación</label>
              <input
                id="codigo"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
              />
              <p className="field__hint">El código vence a los 5 minutos.</p>
            </div>

            <button className="btn btn--primary btn--block" type="submit" disabled={cargando}>
              {cargando ? "Validando..." : "Confirmar código"}
            </button>
          </form>

          <button
            type="button"
            className="btn btn--link"
            onClick={manejarReenvio}
            disabled={segundosRestantes > 0 || cargando}
            style={{ marginTop: "1rem" }}
          >
            {segundosRestantes > 0
              ? `Reenviar código (espera ${segundosRestantes}s)`
              : "Reenviar código"}
          </button>
        </>
      )}
    </AuthShell>
  );
}
