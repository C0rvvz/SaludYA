import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AsistenteChat from "../components/AsistenteChat";
import Logo from "../components/Logo";
import { confirmarAsistenciaPorEnlace, verCitaPorEnlace } from "../api/citas";
import { capitalizar, formatearHora } from "../utils/formato";
import { cuandoEs } from "../utils/agendar";

/**
 * HU-23 — Confirmar asistencia desde el enlace del recordatorio.
 *
 * Página pública: el paciente llega tocando el enlace del mensaje de
 * recordatorio, ve los datos de su cita y confirma con un solo botón, sin
 * iniciar sesión (criterio 2: "confirmar fácilmente"). Abrir el enlace
 * solo consulta la cita: las vistas previas de enlaces de WhatsApp lo
 * abren automáticamente, y eso no debe contar como una confirmación.
 *
 * Si la persona además tiene la sesión abierta, Eli también está aquí.
 */
export default function ConfirmarAsistenciaPage() {
  const { paciente } = useAuth();
  const [parametros] = useSearchParams();
  const token = parametros.get("token") ?? "";

  const [cita, setCita] = useState(null);
  const [cargando, setCargando] = useState(Boolean(token));
  const [errorEnlace, setErrorEnlace] = useState(token ? "" : "Este enlace no es válido.");
  const [enviando, setEnviando] = useState(false);
  const [confirmada, setConfirmada] = useState(false);
  const [error, setError] = useState("");
  const [eliAbierto, setEliAbierto] = useState(false);

  useEffect(() => {
    if (!token) return;
    verCitaPorEnlace(token)
      .then(setCita)
      .catch((err) => setErrorEnlace(err.message))
      .finally(() => setCargando(false));
  }, [token]);

  async function confirmar() {
    setEnviando(true);
    setError("");
    try {
      setCita(await confirmarAsistenciaPorEnlace(token));
      setConfirmada(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  let titulo = "¿Va a asistir a su cita?";
  let texto = "Toque el botón verde para avisarnos que sí va a venir.";
  if (errorEnlace) {
    titulo = "No podemos confirmar con este enlace";
    texto = "Puede revisar su cita, cambiarla o confirmarla desde Mis citas.";
  } else if (confirmada) {
    titulo = cita.ya_estaba_confirmada ? "Su asistencia ya estaba confirmada" : "¡Asistencia confirmada!";
    texto = "Gracias por avisarnos. Lo esperamos.";
  } else if (cita?.ya_estaba_confirmada) {
    titulo = "Su asistencia ya está confirmada";
    texto = "No tiene que hacer nada más. Estos son los datos de su cita:";
  }

  return (
    <div className="confirmar-asistencia">
      <header className="confirmar-asistencia__cabeza">
        <Logo to="/" />
      </header>

      <main className="confirmar-asistencia__centro">
        <section className="card confirmar-asistencia__tarjeta" aria-labelledby="titulo-confirmar" aria-busy={cargando}>
          <p className="rotulo rotulo--marca">Confirmar asistencia</p>
          <h1 id="titulo-confirmar">{titulo}</h1>
          <p className="confirmar-asistencia__texto">{texto}</p>

          {errorEnlace && (
            <div className="alert alert--error" role="alert">
              {errorEnlace}
            </div>
          )}
          {cargando && <p className="confirmar-asistencia__texto">Buscando su cita…</p>}

          {cita && (
            <div>
              <div className="summary-row">
                <span className="summary-row__label">Especialidad</span>
                <span className="summary-row__value">{cita.especialidad}</span>
              </div>
              <div className="summary-row">
                <span className="summary-row__label">Especialista</span>
                <span className="summary-row__value">{cita.profesional}</span>
              </div>
              <div className="summary-row">
                <span className="summary-row__label">Fecha y hora</span>
                <span className="summary-row__value">
                  {cuandoEs(cita.fecha)}, {formatearHora(cita.hora)}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-row__label">Sede</span>
                <span className="summary-row__value">
                  {cita.sede} · {capitalizar(cita.modalidad)}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          )}

          {cita && !cita.ya_estaba_confirmada && !confirmada && (
            <button type="button" className="btn btn--success btn--bloque" onClick={confirmar} disabled={enviando}>
              {enviando ? "Confirmando…" : "Sí, asistiré"}
            </button>
          )}
        </section>

        <p className="confirmar-asistencia__nota">
          ¿No puede asistir o quiere cambiar la fecha? <Link to="/mis-citas">Ingrese a Mis citas</Link>
        </p>
      </main>

      {paciente && (
        <AsistenteChat abierto={eliAbierto} onAbrir={() => setEliAbierto(true)} onCerrar={() => setEliAbierto(false)} />
      )}
    </div>
  );
}
