import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import { listarEspecialidades } from "../api/catalogo";
import { listarMisSolicitudes, radicarSolicitud } from "../api/solicitudes";
import { CANALES } from "../utils/citas";
import { formatearFechaLarga, formatearHora } from "../utils/formato";
import { ESTADOS_SOLICITUD, EXPLICACION_SOLICITUD, TIPOS_CITA, TIPOS_SOLICITUD } from "../utils/solicitudes";
import "../styles/espera-y-cartas.css";

/**
 * "Carta de petición" — HU-76 a HU-79. Un solo apartado con dos tipos de
 * carta (cada uno explicado con un ejemplo antes de escribir):
 *   - "Pedir una cita en otra fecha": ningún horario le sirve y explica por qué.
 *   - "Derecho de petición": la petición formal que la EPS debe responder por ley.
 * A la izquierda se escribe la carta; a la derecha, las que ya envió, con
 * su estado y la respuesta. Desde "Agendar" se llega con
 * ?tipo=formal&especialidad=... ya elegidos.
 */

const manana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local
};

// "2 oct"
const diaCorto = (fechaIso) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
    .format(new Date(fechaIso.length > 10 ? fechaIso : `${fechaIso}T00:00:00`))
    .replace(".", "");

function FormularioCarta({ tipoInicial, especialidadInicial, onListo }) {
  const [especialidades, setEspecialidades] = useState([]);
  const [datos, setDatos] = useState({
    tipo: tipoInicial,
    especialidad_id: especialidadInicial,
    tipo_cita: "primera_vez",
    fecha_deseada: "",
    motivo: "",
    canal: "whatsapp",
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const explicacion = EXPLICACION_SOLICITUD[datos.tipo];

  useEffect(() => {
    listarEspecialidades()
      .then(setEspecialidades)
      .catch((err) => setError(err.message));
  }, []);

  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });
  const elegir = (campo, valor) => setDatos({ ...datos, [campo]: valor });

  async function enviar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const s = await radicarSolicitud(datos);
      const que = datos.tipo === "formal" ? "su carta" : "su derecho de petición";
      setEnviando(false);
      onListo(
        `Recibimos ${que}. Su número de radicado es ${s.numero_radicado}: guárdelo por si necesita preguntar por ella. Le avisaremos por ${CANALES[s.canal]} cuando sea revisada.`
      );
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const opciones = (campo, lista) => (
    <div className="opciones-fila">
      {Object.entries(lista).map(([valor, texto]) => (
        <label className="opcion-radio" key={valor}>
          <input type="radio" name={campo} checked={datos[campo] === valor} onChange={() => elegir(campo, valor)} />
          {texto}
        </label>
      ))}
    </div>
  );

  return (
    <form className="card formulario-paciente" onSubmit={enviar} aria-labelledby="titulo-escribir-carta">
      <h2 id="titulo-escribir-carta">Escribir mi carta</h2>
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      <fieldset className="pregunta-paciente">
        <legend>¿Qué tipo de carta es?</legend>
        {opciones("tipo", TIPOS_SOLICITUD)}
        <p className="pregunta-paciente__ayuda">{explicacion.texto}</p>
      </fieldset>

      <div className="campos-dobles">
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
        <div className="field">
          <label htmlFor="fecha_deseada">¿Para qué fecha la necesita?</label>
          <input
            id="fecha_deseada"
            type="date"
            required
            min={manana()}
            value={datos.fecha_deseada}
            onChange={cambiar("fecha_deseada")}
          />
        </div>
      </div>

      <fieldset className="pregunta-paciente">
        <legend>¿Es su primera cita o un control?</legend>
        {opciones("tipo_cita", TIPOS_CITA)}
      </fieldset>

      <div className="field">
        <label htmlFor="motivo">{explicacion.pregunta}</label>
        <textarea
          id="motivo"
          rows={4}
          required
          minLength={10}
          maxLength={2000}
          value={datos.motivo}
          onChange={cambiar("motivo")}
        />
        <p className="field__hint">{explicacion.ejemplo}</p>
      </div>

      <fieldset className="pregunta-paciente">
        <legend>¿Cómo le avisamos la respuesta?</legend>
        {opciones("canal", CANALES)}
      </fieldset>

      <button
        className="btn btn--primary formulario-paciente__enviar"
        type="submit"
        disabled={enviando || !datos.especialidad_id || !datos.fecha_deseada || datos.motivo.trim().length < 10}
      >
        {enviando ? "Enviando…" : explicacion.boton}
      </button>
    </form>
  );
}

function TarjetaCarta({ s }) {
  const [estado, clase] = ESTADOS_SOLICITUD[s.estado];
  const tituloId = `carta-${s.id}`;
  return (
    <article className="card tarjeta-carta" aria-labelledby={tituloId}>
      <div className="tarjeta-aviso__cabeza">
        <h3 id={tituloId}>
          {s.especialidad} · {TIPOS_CITA[s.tipo_cita]}
        </h3>
        <span className={`badge ${clase}`}>{estado}</span>
      </div>
      <p className="tarjeta-carta__meta">
        {TIPOS_SOLICITUD[s.tipo]} {s.numero_radicado} · enviada el {diaCorto(s.radicada_en)} · para el{" "}
        {diaCorto(s.fecha_deseada)}
      </p>

      {s.cita && (
        <div className="tarjeta-carta__cita">
          Su cita quedó para el {formatearFechaLarga(s.cita.fecha).toLowerCase()} a las {formatearHora(s.cita.hora)} con{" "}
          {s.cita.especialista} en {s.cita.sede}. Comprobante {s.cita.numero_comprobante}.{" "}
          <Link to="/mis-citas">Ver mis citas</Link>
        </div>
      )}
      {s.estado === "pendiente" && <p>La estamos revisando. Le avisaremos por {CANALES[s.canal]}.</p>}
      {s.estado === "pendiente_eps" && <p>Su carta está en trámite con su EPS. Le avisaremos la respuesta.</p>}
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
  const tipoPedido = TIPOS_SOLICITUD[params.get("tipo")] ? params.get("tipo") : "formal";
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [formulario, setFormulario] = useState(0); // al enviar, el formulario vuelve a empezar

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

  return (
    <div>
      <EncabezadoPaciente />

      <div className="section pagina-paciente">
        <div className="pagina-paciente__titulo">
          <div>
            <h1>Carta de petición</h1>
            <p>
              ¿No consigue la cita que necesita? Escríbanos una carta contando su caso y le ayudamos a conseguirla.
              Aquí también ve la respuesta.
            </p>
          </div>
        </div>

        {aviso && (
          <div className="alert alert--success" role="status">
            {aviso}
          </div>
        )}
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}

        <div className="pagina-paciente__cuerpo con-lista pagina-paciente__cuerpo--cartas">
          <FormularioCarta
            key={formulario}
            tipoInicial={formulario === 0 ? tipoPedido : "formal"}
            especialidadInicial={formulario === 0 ? (params.get("especialidad") ?? "") : ""}
            onListo={(mensaje) => {
              setAviso(mensaje);
              setFormulario((n) => n + 1);
              cargar();
            }}
          />

          <section className="pagina-paciente__lista" aria-labelledby="titulo-cartas-enviadas">
            <p className="rotulo" id="titulo-cartas-enviadas">
              Cartas que ya envié
            </p>
            {solicitudes === null && !error && <p className="texto-suave">Cargando sus cartas…</p>}
            {solicitudes?.length === 0 && (
              <p className="pagina-paciente__vacio">Todavía no ha enviado cartas. Cuando envíe una, aquí verá su respuesta.</p>
            )}
            {(solicitudes ?? []).map((s) => (
              <TarjetaCarta key={s.id} s={s} />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
