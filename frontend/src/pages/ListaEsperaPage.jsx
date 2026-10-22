import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AyudaApartado from "../components/AyudaApartado";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import Ventana from "../components/Ventana";
import { listarEspecialidades, listarEspecialistas } from "../api/catalogo";
import {
  aceptarCupo,
  listarMiListaEspera,
  rechazarCupo,
  salirListaEspera,
  unirseListaEspera,
} from "../api/listaEspera";
import { CANALES } from "../utils/citas";
import { formatearFechaLarga, formatearHora, formatearSoloHora } from "../utils/formato";
import { cuandoEs } from "../utils/agendar";
import "../styles/espera-y-cartas.css";

/**
 * "Avisarme si hay cupo" (lista de espera) — HU-19 (posición), HU-31
 * (cupo liberado) y HU-32 (aceptarlo o rechazarlo).
 *
 * A la izquierda, los avisos que ya pidió: su lugar en la fila (número
 * grande y barra), el cupo que se le ofrece y "Ya no quiero el aviso". A
 * la derecha, el formulario para pedir un aviso nuevo. Desde "Agendar"
 * se llega con ?especialidad=... ya elegida.
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
const TEXTO_MODALIDAD = Object.fromEntries(MODALIDADES);

const ESTADOS = {
  en_espera: ["En espera", "badge--info"],
  cupo_ofrecido: ["Cupo ofrecido", "badge--info"],
  asignada: ["Cita asignada", "badge--success"],
  cancelada: ["Sin aviso", "badge--neutral"],
};

// "hasta hoy a las 6:00 p. m.", "hasta mañana a las…" o "hasta el Lun 3 nov a las…"
function hastaCuando(fechaHoraIso) {
  const fecha = new Date(fechaHoraIso).toLocaleDateString("en-CA");
  const dia = cuandoEs(fecha);
  const cuando = ["Hoy", "Mañana"].includes(dia) ? dia.toLowerCase() : `el ${dia}`;
  return `hasta ${cuando} a las ${formatearSoloHora(fechaHoraIso)}`;
}

/** Barra con una rayita por persona (hasta 20): las de antes, la suya y las de después. */
function BarraPosicion({ posicion, total }) {
  const rayas = Math.min(total, 20);
  const suya = Math.max(1, Math.ceil((posicion / total) * rayas));
  return (
    <div className="barra-posicion" style={{ gridTemplateColumns: `repeat(${rayas}, 1fr)` }} aria-hidden="true">
      {Array.from({ length: rayas }, (_, i) => (
        <span key={i} className={i + 1 < suya ? "is-antes" : i + 1 === suya ? "is-suya" : ""} />
      ))}
    </div>
  );
}

function TarjetaAviso({ solicitud: s, ocupado, onAceptar, onRechazar, onSalir }) {
  const activa = ["en_espera", "cupo_ofrecido"].includes(s.estado);
  const [estado, clase] = ESTADOS[s.estado] ?? [s.estado, "badge--neutral"];
  const tituloId = `aviso-${s.id}`;

  return (
    <article className="card tarjeta-aviso" aria-labelledby={tituloId}>
      <div className="tarjeta-aviso__cabeza">
        <h2 id={tituloId}>{s.especialidad}</h2>
        <span className={`badge ${clase}`}>{estado}</span>
      </div>

      {activa && s.posicion && (
        <>
          <div className="tarjeta-aviso__posicion">
            <span className="tarjeta-aviso__numero" aria-hidden="true">
              {s.posicion}
            </span>
            <span>
              Usted es el número {s.posicion} de {s.total_en_lista} en la lista
            </span>
          </div>
          <BarraPosicion posicion={s.posicion} total={s.total_en_lista} />
        </>
      )}

      {s.oferta && (
        <div className="oferta-cupo">
          <p className="oferta-cupo__rotulo">Se liberó un cupo para usted</p>
          <p className="oferta-cupo__cuando">
            {formatearFechaLarga(s.oferta.fecha)}, {formatearHora(s.oferta.hora)}
          </p>
          <p className="oferta-cupo__quien">
            {s.oferta.especialista} · {s.oferta.sede} · {s.oferta.modalidad === "virtual" ? "Virtual" : "Presencial"}
          </p>
          {/* Sin punto final: la hora ya termina en "a. m." / "p. m." */}
          <p className="oferta-cupo__hasta">Lo tenemos reservado {hastaCuando(s.oferta.expira_en)}</p>
          <div className="oferta-cupo__acciones">
            <button type="button" className="btn oferta-cupo__aceptar" disabled={ocupado} onClick={() => onAceptar(s)}>
              Aceptar esta cita
            </button>
            <button type="button" className="btn oferta-cupo__rechazar" disabled={ocupado} onClick={() => onRechazar(s)}>
              No me sirve
            </button>
          </div>
        </div>
      )}

      {s.estado === "asignada" && s.cita && (
        <div className="alert alert--success">
          Su cita quedó agendada para el {formatearFechaLarga(s.cita.fecha).toLowerCase()} a las{" "}
          {formatearHora(s.cita.hora)} con {s.cita.especialista} en {s.cita.sede}. Comprobante{" "}
          {s.cita.numero_comprobante}. <Link to="/mis-citas">Ver mis citas</Link>
        </div>
      )}

      <p className="tarjeta-aviso__preferencias">
        {s.sedes.join(", ")} · {TEXTO_JORNADA[s.jornada]} · {TEXTO_MODALIDAD[s.modalidad ?? ""]} · Le avisamos por{" "}
        {CANALES[s.canal]}
      </p>

      {activa && (
        <button type="button" className="btn btn--peligro-outline boton-quitar-aviso" onClick={() => onSalir(s)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Ya no quiero el aviso
        </button>
      )}
    </article>
  );
}

function FormularioAviso({ titulo, especialidadInicial, onListo }) {
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

  async function pedirAviso(evento) {
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
      setEnviando(false);
      onListo(
        solicitud.oferta
          ? `Listo: ya está en la lista de ${solicitud.especialidad}, y hay un cupo para usted. Revíselo en su aviso.`
          : `Listo: ya está en la lista de ${solicitud.especialidad}. Usted es el número ${solicitud.posicion}. Le avisaremos por ${CANALES[canal]} cuando se libere un cupo.`
      );
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  const opciones = (nombre, lista, valorActual, cambiar) => (
    <div className="opciones-fila">
      {lista.map(([valor, texto]) => (
        <label className="opcion-radio" key={valor || "todas"}>
          <input type="radio" name={nombre} checked={valorActual === valor} onChange={() => cambiar(valor)} />
          {texto}
        </label>
      ))}
    </div>
  );

  return (
    <form className="card formulario-paciente" onSubmit={pedirAviso} aria-labelledby="titulo-pedir-aviso">
      <h2 id="titulo-pedir-aviso">{titulo}</h2>
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

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
          <fieldset className="pregunta-paciente">
            <legend>¿En qué sedes puede atenderse?</legend>
            <div className="opciones-fila">
              {sedes.map((s) => (
                <label className="opcion-radio" key={s.id}>
                  <input type="checkbox" checked={sedeIds.includes(s.id)} onChange={() => alternarSede(s.id)} />
                  {s.nombre}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="pregunta-paciente">
            <legend>¿A qué hora le queda mejor?</legend>
            {opciones("jornada", JORNADAS, jornada, setJornada)}
          </fieldset>
          <fieldset className="pregunta-paciente">
            <legend>¿Cómo prefiere la cita?</legend>
            {opciones("modalidad", MODALIDADES, modalidad, setModalidad)}
          </fieldset>
          <fieldset className="pregunta-paciente">
            <legend>¿Cómo le avisamos?</legend>
            {opciones("canal", Object.entries(CANALES), canal, setCanal)}
          </fieldset>
        </>
      )}

      <button
        className="btn btn--primary formulario-paciente__enviar"
        type="submit"
        disabled={enviando || !especialidadId || sedeIds.length === 0}
      >
        {enviando ? "Guardando…" : "Avisarme cuando haya cupo"}
      </button>
    </form>
  );
}

export default function ListaEsperaPage() {
  const [params] = useSearchParams();
  const especialidadInicial = params.get("especialidad");
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [quitando, setQuitando] = useState(null); // el aviso que se va a quitar (ventana)
  const [errorVentana, setErrorVentana] = useState("");
  const [formulario, setFormulario] = useState(0); // al pedir un aviso, el formulario vuelve a empezar

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
      // Primero se recarga (cargar() limpia el error) y después se muestra el error.
      await cargar();
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  async function quitarAviso() {
    setOcupado(true);
    setErrorVentana("");
    try {
      await salirListaEspera(quitando.id);
      setAviso(`Listo: ya no le avisaremos de cupos de ${quitando.especialidad}.`);
      setQuitando(null);
      await cargar();
    } catch (err) {
      setErrorVentana(err.message);
    } finally {
      setOcupado(false);
    }
  }

  const tiene = (solicitudes ?? []).length > 0;
  const activas = (solicitudes ?? []).some((s) => ["en_espera", "cupo_ofrecido"].includes(s.estado));

  return (
    <div>
      <EncabezadoPaciente />

      <div className="section pagina-paciente">
        <div className="pagina-paciente__titulo">
          <div>
            <h1>Avisarme si hay cupo</h1>
            <p>Díganos qué horario le queda mejor y le avisamos apenas se libere un cupo.</p>
          </div>
          {activas && (
            <button type="button" className="btn btn--outline" disabled={ocupado} onClick={() => cargar()}>
              Actualizar mi posición
            </button>
          )}
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

        <div className={`pagina-paciente__cuerpo ${tiene ? "con-lista" : ""}`}>
          {tiene && (
            <div className="pagina-paciente__lista">
              {solicitudes.map((s) => (
                <TarjetaAviso
                  key={s.id}
                  solicitud={s}
                  ocupado={ocupado}
                  onAceptar={(x) =>
                    responder(
                      () => aceptarCupo(x.id),
                      (r) =>
                        `¡Listo! Su cita quedó agendada para el ${formatearFechaLarga(r.cita.fecha).toLowerCase()} a las ${formatearHora(r.cita.hora)}. Comprobante ${r.cita.numero_comprobante}.`
                    )
                  }
                  onRechazar={(x) =>
                    responder(
                      () => rechazarCupo(x.id),
                      () => "Entendido. Conserva su lugar en la lista y le avisaremos del próximo cupo."
                    )
                  }
                  onSalir={(x) => {
                    setErrorVentana("");
                    setQuitando(x);
                  }}
                />
              ))}
            </div>
          )}

          <div className="pagina-paciente__lado">
            {solicitudes !== null && (
              <FormularioAviso
                key={formulario}
                titulo={tiene ? "Pedir aviso para otra especialidad" : "Pedir un aviso"}
                especialidadInicial={formulario === 0 ? especialidadInicial : ""}
                onListo={(mensaje) => {
                  setAviso(mensaje);
                  setFormulario((n) => n + 1);
                  cargar();
                }}
              />
            )}
            <AyudaApartado titulo="¿Cómo funciona?">
              <ul>
                <li>Cuando otro paciente cancele una cita que le sirva, le avisamos por el medio que elija.</li>
                <li>Le guardamos ese cupo un tiempo para que lo acepte o lo rechace. Si lo rechaza, sigue en la lista.</li>
              </ul>
            </AyudaApartado>
          </div>
        </div>
      </div>

      {quitando && (
        <Ventana titulo="¿Ya no quiere el aviso?" ocupado={ocupado} onCerrar={() => setQuitando(null)}>
          <p className="ventana__texto">
            Dejaremos de avisarle cuando haya cupos de {quitando.especialidad} y perderá su lugar en la lista.
          </p>
          {errorVentana && (
            <div className="alert alert--error" role="alert">
              {errorVentana}
            </div>
          )}
          <div className="ventana__acciones">
            <button type="button" className="btn btn--peligro" disabled={ocupado} onClick={quitarAviso}>
              {ocupado ? "Quitando…" : "Sí, quitar el aviso"}
            </button>
            <button
              type="button"
              className="btn btn--outline"
              disabled={ocupado}
              onClick={() => setQuitando(null)}
            >
              No, seguir en la lista
            </button>
          </div>
        </Ventana>
      )}
    </div>
  );
}
