import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AyudaApartado from "../components/AyudaApartado";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import { listarEspecialidades } from "../api/catalogo";
import { listarMisSolicitudes, radicarSolicitud } from "../api/solicitudes";
import { CANALES } from "../utils/citas";
import { formatearFechaHora, formatearFechaLarga, formatearHora } from "../utils/formato";
import { ESTADOS_SOLICITUD, EXPLICACION_SOLICITUD, TIPOS_CITA, TIPOS_SOLICITUD } from "../utils/solicitudes";

/**
 * Cartas y peticiones del paciente (HU-76 a HU-79). Antes se llamaba
 * "Solicitudes" y no se entendía para qué era. Ahora, en un solo
 * apartado, el paciente primero elige qué necesita:
 *   - "Pedir una cita en otra fecha": ningún horario le sirve y explica por qué.
 *   - "Derecho de petición": la petición formal que la EPS debe responder por ley.
 * y después escribe la carta. El personal las revisa en el mismo lugar.
 * Desde la búsqueda de citas se llega con ?tipo=formal&especialidad=...
 */

const manana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local
};

function ElegirTipo({ onElegir, onVolver }) {
  return (
    <section className="card lista-espera__formulario" aria-labelledby="elegir-carta">
      <h2 id="elegir-carta">¿Qué necesita?</h2>
      <div className="opciones-carta">
        {Object.entries(TIPOS_SOLICITUD).map(([valor, titulo]) => (
          <button key={valor} type="button" className="opcion-carta" onClick={() => onElegir(valor)}>
            <span className="opcion-carta__titulo">{titulo}</span>
            <span>{EXPLICACION_SOLICITUD[valor].texto}</span>
            <span className="opcion-carta__ejemplo">{EXPLICACION_SOLICITUD[valor].ejemplo}</span>
          </button>
        ))}
      </div>
      {onVolver && (
        <div className="acciones-admin">
          <button className="btn btn--outline" type="button" onClick={onVolver}>
            Volver
          </button>
        </div>
      )}
    </section>
  );
}

function FormularioSolicitud({ tipo, especialidadInicial, onCambiarTipo, onListo }) {
  const explicacion = EXPLICACION_SOLICITUD[tipo];
  const [especialidades, setEspecialidades] = useState([]);
  const [datos, setDatos] = useState({
    especialidad_id: especialidadInicial,
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

  async function enviar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const s = await radicarSolicitud({ tipo, ...datos });
      const que = tipo === "formal" ? "su carta" : "su derecho de petición";
      onListo(
        `Recibimos ${que}. Su número de radicado es ${s.numero_radicado}: guárdelo por si necesita preguntar por ella. Le avisaremos por ${CANALES[s.canal]} cuando sea revisada.`
      );
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="card lista-espera__formulario" onSubmit={enviar}>
      <h2>{TIPOS_SOLICITUD[tipo]}</h2>
      <p>{explicacion.texto}</p>
      <button type="button" className="btn btn--link" onClick={onCambiarTipo}>
        Elegir otro tipo de carta
      </button>
      {error && <div className="alert alert--error">{error}</div>}

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
        <label htmlFor="motivo">{explicacion.pregunta}</label>
        <textarea id="motivo" rows={4} required minLength={10} maxLength={2000} value={datos.motivo} onChange={cambiar("motivo")} />
        <p className="field__hint">{explicacion.ejemplo}</p>
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
          {enviando ? "Enviando..." : explicacion.boton}
        </button>
      </div>
    </form>
  );
}

function TarjetaSolicitud({ s }) {
  const [estado, clase] = ESTADOS_SOLICITUD[s.estado];
  return (
    <article className="card lista-espera__solicitud">
      <h2>
        {TIPOS_SOLICITUD[s.tipo]} · {s.especialidad}
      </h2>
      <p>
        <span className={`badge ${clase}`}>{estado}</span>
      </p>
      <p className="texto-suave">
        {TIPOS_CITA[s.tipo_cita]} · para el {formatearFechaLarga(s.fecha_deseada).toLowerCase()} · enviada el{" "}
        {formatearFechaHora(s.radicada_en)} · radicado {s.numero_radicado}
      </p>
      {s.estado === "pendiente_eps" && <p>Su carta está en trámite con su EPS. Le avisaremos la respuesta.</p>}
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
  const [params] = useSearchParams();
  const tipoPedido = params.get("tipo");
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  // null: solo la lista · "elegir": las dos opciones · "formal" | "derecho_peticion": la carta
  const [paso, setPaso] = useState(TIPOS_SOLICITUD[tipoPedido] ? tipoPedido : null);

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
  // Sin cartas todavía, se empieza directamente por elegir qué necesita.
  const pasoVisible = paso ?? (sinSolicitudes ? "elegir" : null);

  return (
    <div>
      <EncabezadoPaciente />

      <div className="section lista-espera">
        <h1 style={{ fontSize: "var(--text-xl)" }}>Cartas y peticiones</h1>
        <AyudaApartado>
          <p>
            Escríbale a su EPS cuando no consigue la cita que necesita. El personal lee su carta, le responde por el
            medio que usted elija y, si la aprueba, le asigna la cita.
          </p>
        </AyudaApartado>

        {aviso && <div className="alert alert--success">{aviso}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        {pasoVisible === "elegir" && (
          <ElegirTipo onElegir={setPaso} onVolver={sinSolicitudes ? null : () => setPaso(null)} />
        )}

        {TIPOS_SOLICITUD[pasoVisible] && (
          <FormularioSolicitud
            key={pasoVisible}
            tipo={pasoVisible}
            especialidadInicial={params.get("especialidad") ?? ""}
            onCambiarTipo={() => setPaso("elegir")}
            onListo={(mensaje) => {
              setAviso(mensaje);
              setPaso(null);
              cargar();
            }}
          />
        )}

        {pasoVisible === null && solicitudes !== null && (
          <div className="acciones-admin lista-espera__acciones">
            <button
              className="btn btn--primary"
              onClick={() => {
                setAviso("");
                setPaso("elegir");
              }}
            >
              Escribir una carta
            </button>
          </div>
        )}

        {!sinSolicitudes && solicitudes !== null && <h2 className="grupo-mes__titulo">Sus cartas</h2>}
        {(solicitudes ?? []).map((s) => (
          <TarjetaSolicitud key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}
