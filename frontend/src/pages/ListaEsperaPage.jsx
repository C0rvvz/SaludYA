import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import { listarEspecialidades, listarEspecialistas } from "../api/catalogo";
import {
  aceptarCupo,
  listarMiListaEspera,
  rechazarCupo,
  salirListaEspera,
  unirseListaEspera,
} from "../api/listaEspera";
import { CANALES } from "../utils/citas";
import { formatearFechaHora, formatearFechaLarga, formatearHora } from "../utils/formato";

/**
 * Lista de espera — HU-19 (posición), HU-31 (cupo liberado) y HU-32
 * (aceptarlo o rechazarlo). El paciente se une con sus preferencias y
 * aquí ve su lugar en la fila y el cupo que se le ofrece.
 */

const JORNADAS = [
  ["cualquiera", "A cualquier hora"],
  ["manana", "En la mañana"],
  ["tarde", "En la tarde"],
];

const MODALIDADES = [
  ["", "Presencial o virtual"],
  ["presencial", "Presencial"],
  ["virtual", "Virtual"],
];

const TEXTO_JORNADA = Object.fromEntries(JORNADAS);

function FormularioUnirse({ especialidadInicial, onListo, onVolver }) {
  const [especialidades, setEspecialidades] = useState([]);
  const [especialidadId, setEspecialidadId] = useState(especialidadInicial ?? "");
  const [sedes, setSedes] = useState([]); // las de la especialidad elegida
  const [sedeIds, setSedeIds] = useState([]);
  const [jornada, setJornada] = useState("cualquiera");
  const [modalidad, setModalidad] = useState("");
  const [canal, setCanal] = useState("whatsapp");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarEspecialidades()
      .then(setEspecialidades)
      .catch((err) => setError(err.message));
  }, []);

  // Solo las sedes donde atiende esa especialidad; todas marcadas al inicio.
  useEffect(() => {
    if (!especialidadId) return;
    listarEspecialistas(especialidadId)
      .then((especialistas) => {
        const unicas = new Map(especialistas.flatMap((e) => e.sedes).map((s) => [s.id, s]));
        setSedes([...unicas.values()]);
        setSedeIds([...unicas.keys()]);
      })
      .catch((err) => setError(err.message));
  }, [especialidadId]);

  function alternarSede(id) {
    setSedeIds((actuales) => (actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]));
  }

  async function unirse(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const solicitud = await unirseListaEspera({
        especialidad_id: especialidadId,
        sede_ids: sedeIds,
        jornada,
        modalidad: modalidad || null,
        canal,
      });
      onListo(
        solicitud.oferta
          ? `Ya está en la lista de espera de ${solicitud.especialidad}, y hay un cupo para usted: revíselo abajo.`
          : `Ya está en la lista de espera de ${solicitud.especialidad}. Usted es el número ${solicitud.posicion}. Le avisaremos por ${CANALES[canal]} cuando se libere un cupo.`
      );
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="card lista-espera__formulario" onSubmit={unirse}>
      <h2>Unirme a la lista de espera</h2>
      {error && <div className="alert alert--error">{error}</div>}

      <div className="field">
        <label htmlFor="especialidad">¿Qué especialidad necesita?</label>
        <select id="especialidad" required value={especialidadId} onChange={(e) => setEspecialidadId(e.target.value)}>
          <option value="">Elija una especialidad</option>
          {especialidades.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>

      {especialidadId && (
        <>
          <p className="lista-espera__pregunta">¿En qué sedes puede atenderse?</p>
          <div className="channel-grid">
            {sedes.map((s) => (
              <label className="channel-card" key={s.id}>
                <input type="checkbox" checked={sedeIds.includes(s.id)} onChange={() => alternarSede(s.id)} />
                {s.nombre}
              </label>
            ))}
          </div>

          <p className="lista-espera__pregunta">¿A qué hora le queda mejor?</p>
          <div className="channel-grid">
            {JORNADAS.map(([valor, texto]) => (
              <label className="channel-card" key={valor}>
                <input type="radio" name="jornada" checked={jornada === valor} onChange={() => setJornada(valor)} />
                {texto}
              </label>
            ))}
          </div>

          <p className="lista-espera__pregunta">¿Cómo prefiere la cita?</p>
          <div className="channel-grid">
            {MODALIDADES.map(([valor, texto]) => (
              <label className="channel-card" key={valor || "cualquiera"}>
                <input type="radio" name="modalidad" checked={modalidad === valor} onChange={() => setModalidad(valor)} />
                {texto}
              </label>
            ))}
          </div>

          <p className="lista-espera__pregunta">¿Cómo le avisamos cuando haya un cupo?</p>
          <div className="channel-grid">
            {Object.entries(CANALES).map(([valor, texto]) => (
              <label className="channel-card" key={valor}>
                <input type="radio" name="canal" checked={canal === valor} onChange={() => setCanal(valor)} />
                {texto}
              </label>
            ))}
          </div>
        </>
      )}

      <div className="acciones-admin">
        <button className="btn btn--primary" type="submit" disabled={enviando || !especialidadId || sedeIds.length === 0}>
          {enviando ? "Guardando..." : "Unirme a la lista de espera"}
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

function TarjetaSolicitud({ solicitud: s, ocupado, onAceptar, onRechazar, onSalir }) {
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const activa = ["en_espera", "cupo_ofrecido"].includes(s.estado);

  return (
    <article className="card lista-espera__solicitud">
      <h2>{s.especialidad}</h2>

      {activa && (
        <p className="lista-espera__posicion">
          Usted es el número <strong>{s.posicion}</strong> de {s.total_en_lista} en la lista.
        </p>
      )}

      {s.oferta && (
        <div className="lista-espera__oferta">
          <p className="lista-espera__oferta-titulo">Se liberó un cupo para usted</p>
          <p>
            <strong>
              {formatearFechaLarga(s.oferta.fecha)}, {formatearHora(s.oferta.hora)}
            </strong>
            <br />
            {s.oferta.especialista} · {s.oferta.sede} · {s.oferta.modalidad === "virtual" ? "Virtual" : "Presencial"}
          </p>
          <p className="texto-suave">Lo tenemos reservado para usted hasta el {formatearFechaHora(s.oferta.expira_en)}.</p>
          <div className="acciones-admin">
            <button className="btn btn--success" disabled={ocupado} onClick={() => onAceptar(s)}>
              Aceptar esta cita
            </button>
            <button className="btn btn--outline" disabled={ocupado} onClick={() => onRechazar(s)}>
              No me sirve
            </button>
          </div>
        </div>
      )}

      {s.estado === "asignada" && s.cita && (
        <div className="alert alert--success">
          Su cita quedó agendada para el {formatearFechaLarga(s.cita.fecha)} a las {formatearHora(s.cita.hora)} con{" "}
          {s.cita.especialista} en {s.cita.sede}. Comprobante {s.cita.numero_comprobante}.{" "}
          <Link to="/mis-citas">Ver mis citas</Link>
        </div>
      )}

      <p className="texto-suave">
        {s.sedes.join(", ")} · {TEXTO_JORNADA[s.jornada]} ·{" "}
        {s.modalidad ? (s.modalidad === "virtual" ? "Virtual" : "Presencial") : "Presencial o virtual"} · Le
        avisamos por {CANALES[s.canal]}
      </p>

      {activa &&
        (confirmandoSalida ? (
          <div className="acciones-admin">
            <span>¿Seguro que quiere salir de esta lista?</span>
            <button className="btn btn--peligro" disabled={ocupado} onClick={() => onSalir(s)}>
              Sí, salir
            </button>
            <button className="btn btn--outline" onClick={() => setConfirmandoSalida(false)}>
              No
            </button>
          </div>
        ) : (
          <button className="btn btn--peligro-outline btn--compacto" onClick={() => setConfirmandoSalida(true)}>
            Salir de la lista
          </button>
        ))}
    </article>
  );
}

export default function ListaEsperaPage() {
  const [params] = useSearchParams();
  const especialidadInicial = params.get("especialidad");
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [uniendose, setUniendose] = useState(Boolean(especialidadInicial));

  const cargar = useCallback(
    () =>
      listarMiListaEspera()
        .then((lista) => {
          setSolicitudes(lista);
          setError("");
        })
        .catch((err) => setError(err.message)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function responder(fn, mensaje) {
    setOcupado(true);
    setAviso("");
    setError("");
    try {
      setAviso(mensaje(await fn()));
      await cargar();
    } catch (err) {
      setError(err.message);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  const sinSolicitudes = solicitudes !== null && solicitudes.length === 0;

  return (
    <div>
      <EncabezadoPaciente />

      <div className="section lista-espera">
        <h1 style={{ fontSize: "var(--text-xl)" }}>Lista de espera</h1>
        <p>Si no encuentra un horario que le sirva, le avisamos cuando se libere un cupo.</p>

        {aviso && <div className="alert alert--success">{aviso}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        {(solicitudes ?? []).map((s) => (
          <TarjetaSolicitud
            key={s.id}
            solicitud={s}
            ocupado={ocupado}
            onAceptar={(x) =>
              responder(
                () => aceptarCupo(x.id),
                (r) =>
                  `¡Listo! Su cita quedó agendada para el ${formatearFechaLarga(r.cita.fecha)} a las ${formatearHora(r.cita.hora)}. Comprobante ${r.cita.numero_comprobante}.`
              )
            }
            onRechazar={(x) =>
              responder(
                () => rechazarCupo(x.id),
                () => "Entendido. Conserva su lugar en la lista y le avisaremos del próximo cupo."
              )
            }
            onSalir={(x) =>
              responder(() => salirListaEspera(x.id), () => `Salió de la lista de espera de ${x.especialidad}.`)
            }
          />
        ))}

        {solicitudes !== null && (
          <div className="acciones-admin lista-espera__acciones">
            {!sinSolicitudes && (
              <button className="btn btn--outline" disabled={ocupado} onClick={() => cargar()}>
                Actualizar mi posición
              </button>
            )}
            {!uniendose && !sinSolicitudes && (
              <button className="btn btn--outline" onClick={() => setUniendose(true)}>
                Unirme a otra lista
              </button>
            )}
          </div>
        )}

        {(uniendose || sinSolicitudes) && (
          <FormularioUnirse
            especialidadInicial={especialidadInicial}
            onVolver={sinSolicitudes ? null : () => setUniendose(false)}
            onListo={(mensaje) => {
              setAviso(mensaje);
              setUniendose(false);
              cargar();
            }}
          />
        )}
      </div>
    </div>
  );
}
