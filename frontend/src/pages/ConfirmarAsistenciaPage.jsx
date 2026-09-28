import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { confirmarAsistenciaPorEnlace } from "../api/citas";
import { capitalizar, formatearFechaLarga, formatearHora } from "../utils/formato";

/**
 * HU-23 — Confirmar asistencia desde el enlace del recordatorio.
 *
 * Página pública: el paciente llega tocando el enlace del mensaje de
 * recordatorio y confirma con un solo botón, sin iniciar sesión
 * (criterio 2: "confirmar fácilmente"). No se confirma solo con abrir
 * el enlace: las vistas previas de enlaces de WhatsApp lo abren
 * automáticamente, y eso no debe contar como una confirmación.
 */
export default function ConfirmarAsistenciaPage() {
  const [parametros] = useSearchParams();
  const token = parametros.get("token") ?? "";

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(token ? "" : "Este enlace no es válido.");

  async function confirmar() {
    setEnviando(true);
    setError("");
    try {
      setResultado(await confirmarAsistenciaPorEnlace(token));
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card__header">
        <p className="auth-card__eyebrow">Confirmar asistencia</p>

        {resultado ? (
          <>
            <h1>{resultado.ya_estaba_confirmada ? "Su asistencia ya estaba confirmada" : "¡Asistencia confirmada!"}</h1>
            <p className="auth-card__lead">Gracias por avisarnos. Estos son los datos de su cita:</p>
          </>
        ) : (
          <>
            <h1>¿Va a asistir a su cita?</h1>
            <p className="auth-card__lead">
              Confírmelo con un toque. Así podemos ofrecer a otra persona los horarios que no se van a usar.
            </p>
          </>
        )}
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {resultado && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="summary-row">
            <span className="summary-row__label">Especialidad</span>
            <span className="summary-row__value">{resultado.especialidad}</span>
          </div>
          <div className="summary-row">
            <span className="summary-row__label">Especialista</span>
            <span className="summary-row__value">{resultado.profesional}</span>
          </div>
          <div className="summary-row">
            <span className="summary-row__label">Fecha y hora</span>
            <span className="summary-row__value">
              {formatearFechaLarga(resultado.fecha)}, {formatearHora(resultado.hora)}
            </span>
          </div>
          <div className="summary-row">
            <span className="summary-row__label">Sede</span>
            <span className="summary-row__value">
              {resultado.sede} · {capitalizar(resultado.modalidad)}
            </span>
          </div>
        </div>
      )}

      {!resultado && token && (
        <button className="btn btn--success btn--block" onClick={confirmar} disabled={enviando}>
          {enviando ? "Confirmando..." : "Sí, asistiré"}
        </button>
      )}

      <p className="field__hint" style={{ marginTop: "1rem", textAlign: "center" }}>
        ¿No puede asistir o quiere cambiar la fecha?{" "}
        <Link to="/mis-citas" className="link-inline">
          Ingrese a Mis citas
        </Link>
      </p>
    </AuthShell>
  );
}
