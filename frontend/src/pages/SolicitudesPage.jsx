import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import { listarEspecialidades } from "../api/catalogo";
import { listarMisSolicitudes, radicarSolicitud } from "../api/solicitudes";
import { CANALES } from "../utils/citas";
import { formatearFechaHora, formatearFechaLarga, formatearHora } from "../utils/formato";
import { ESTADOS_SOLICITUD, TIPOS_CITA, TIPOS_SOLICITUD } from "../utils/solicitudes";

/**
 * Solicitudes de cita del paciente (cartas de petición): radica una
 * solicitud formal o un derecho de petición para una cita que no ha
 * podido conseguir, y ve su estado y la respuesta. Las revisa el
 * personal (HU-76 a HU-79).
 */

const manana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local
};

function FormularioSolicitud({ onListo, onVolver }) {
  const [especialidades, setEspecialidades] = useState([]);
  const [datos, setDatos] = useState({
    tipo: "formal",
    especialidad_id: "",
    tipo_cita: "primera_vez",
    fecha_deseada: "",
    motivo: "",
    canal: "whatsapp",
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarEspecialidades()
      .then(setEspecialidades)
      .catch((err) => setError(err.message));
  }, []);

  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });

  async function radicar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const s = await radicarSolicitud(datos);
      onListo(`Radicamos su solicitud con el número ${s.numero_radicado}. Le avisaremos por ${CANALES[s.canal]} cuando sea revisada.`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="card lista-espera__formulario" onSubmit={radicar}>
      <h2>Radicar una solicitud</h2>
      {error && <div className="alert alert--error">{error}</div>}

      <p className="lista-espera__pregunta">¿Qué tipo de solicitud es?</p>
      <div className="channel-grid">
        {Object.entries(TIPOS_SOLICITUD).map(([valor, texto]) => (
          <label className="channel-card" key={valor}>
            <input type="radio" name="tipo" checked={datos.tipo === valor} onChange={() => setDatos({ ...datos, tipo: valor })} />
            {texto}
          </label>
        ))}
      </div>

      <div className="field">
        <label htmlFor="especialidad">¿Qué especialidad necesita?</label>
        <select id="especialidad" required value={datos.especialidad_id} onChange={cambiar("especialidad_id")}>
          <option value="">Elija una especialidad</option>
          {especialidades.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>

      <p className="lista-espera__pregunta">¿Es su primera cita con esa especialidad o un control?</p>
      <div className="channel-grid">
        {Object.entries(TIPOS_CITA).map(([valor, texto]) => (
          <label className="channel-card" key={valor}>
            <input
              type="radio"
              name="tipo_cita"
              checked={datos.tipo_cita === valor}
              onChange={() => setDatos({ ...datos, tipo_cita: valor })}
            />
            {texto}
          </label>
        ))}
      </div>

      <div className="field">
        <label htmlFor="fecha_deseada">¿Para qué fecha necesita la cita?</label>
        <input id="fecha_deseada" type="date" required min={manana()} value={datos.fecha_deseada} onChange={cambiar("fecha_deseada")} />
      </div>

      <div className="field">
        <label htmlFor="motivo">Cuéntenos por qué la necesita</label>
        <textarea id="motivo" rows={4} required minLength={10} maxLength={2000} value={datos.motivo} onChange={cambiar("motivo")} />
      </div>

      <p className="lista-espera__pregunta">¿Cómo le avisamos la respuesta?</p>
      <div className="channel-grid">
        {Object.entries(CANALES).map(([valor, texto]) => (
          <label className="channel-card" key={valor}>
            <input type="radio" name="canal" checked={datos.canal === valor} onChange={() => setDatos({ ...datos, canal: valor })} />
            {texto}
          </label>
        ))}
      </div>

      <div className="acciones-admin">
        <button
          className="btn btn--primary"
          type="submit"
          disabled={enviando || !datos.especialidad_id || !datos.fecha_deseada || datos.motivo.trim().length < 10}
        >
          {enviando ? "Radicando..." : "Radicar solicitud"}
        </button>
        {onVolver && (
          <button className="btn btn--outline" type="button" onClick={onVolver}>
            Volver
          </button>
        )}
      </div>
    </form>
  );
}

function TarjetaSolicitud({ s }) {
  const [estado, clase] = ESTADOS_SOLICITUD[s.estado];
  return (
    <article className="card lista-espera__solicitud">
      <h2>
        {s.especialidad} · {TIPOS_CITA[s.tipo_cita]}
      </h2>
      <p>
        <span className={`badge ${clase}`}>{estado}</span>
      </p>
      <p className="texto-suave">
        {TIPOS_SOLICITUD[s.tipo]} {s.numero_radicado} · radicada el {formatearFechaHora(s.radicada_en)} · para el{" "}
        {formatearFechaLarga(s.fecha_deseada)}
      </p>
      {s.estado === "pendiente_eps" && <p>Su solicitud está en trámite con su EPS. Le avisaremos la respuesta.</p>}
      {s.cita && (
        <div className="alert alert--success">
          Su cita quedó agendada para el {formatearFechaLarga(s.cita.fecha)} a las {formatearHora(s.cita.hora)} con{" "}
          {s.cita.especialista} en {s.cita.sede}. Comprobante {s.cita.numero_comprobante}.{" "}
          <Link to="/mis-citas">Ver mis citas</Link>
        </div>
      )}
      {s.respuesta && (
        <p>
          <strong>Respuesta:</strong> {s.respuesta}
        </p>
      )}
    </article>
  );
}

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [radicando, setRadicando] = useState(false);

  const cargar = useCallback(
    () =>
      listarMisSolicitudes()
        .then(setSolicitudes)
        .catch((err) => setError(err.message)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const sinSolicitudes = solicitudes !== null && solicitudes.length === 0;

  return (
    <div>
      <EncabezadoPaciente />

      <div className="section lista-espera">
        <h1 style={{ fontSize: "var(--text-xl)" }}>Solicitudes</h1>
        <p>
          Si necesita una cita que no ha podido conseguir, radique una solicitud formal o un derecho de petición. La
          revisamos y le respondemos.
        </p>

        {aviso && <div className="alert alert--success">{aviso}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        {(radicando || sinSolicitudes) && (
          <FormularioSolicitud
            onVolver={sinSolicitudes ? null : () => setRadicando(false)}
            onListo={(mensaje) => {
              setAviso(mensaje);
              setRadicando(false);
              cargar();
            }}
          />
        )}

        {!radicando && !sinSolicitudes && solicitudes !== null && (
          <div className="acciones-admin lista-espera__acciones">
            <button className="btn btn--primary" onClick={() => setRadicando(true)}>
              Radicar una solicitud
            </button>
          </div>
        )}

        {(solicitudes ?? []).map((s) => (
          <TarjetaSolicitud key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}
