import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { enviarMensaje, obtenerConversacion, reiniciarConversacion } from "../api/chat";
import { ApiError } from "../api/client";
import useDictado from "../hooks/useDictado";
import EliAvatar from "./EliAvatar";
import { Chevron } from "./Iconos";
import { CANALES } from "../utils/citas";
import { capitalizar, formatearFecha, formatearHora } from "../utils/formato";
import { cuandoEs } from "../utils/agendar";
import "../styles/eli.css";

/**
 * Asistente conversacional — HU-33.
 *
 * El paciente escribe (o dicta) libremente, o toca una respuesta rápida,
 * y el resultado llega dentro del mismo chat: la cita que Eli propone se
 * ve como tarjeta con "Agendar esa cita", "Elegir otra fecha" y "Escribir
 * carta de petición"; la cita ya agendada (o cancelada, cambiada...) como
 * comprobante, y una urgencia como aviso destacado con botón para llamar.
 * Pensado para adultos mayores: letra grande, mensajes cortos y
 * respuestas rápidas para tocar en vez de escribir.
 */

// HU-33, criterio 1: sugerencias rápidas para empezar.
const SUGERENCIAS_INICIALES = ["Solicitar una cita", "Ver mis citas"];

// Lo que se le dice a Eli al tocar cada respuesta rápida de una propuesta.
const AGENDAR_PROPUESTA = "Sí, agende esa cita";
const OTRA_FECHA = "Quiero elegir otra fecha";

// Encabezado del comprobante según la acción que hizo el asistente.
const TARJETAS = {
  cita_agendada: { texto: "Cita confirmada", clase: "badge--success" },
  asistencia_confirmada: { texto: "Asistencia confirmada", clase: "badge--success" },
  llegada_registrada: { texto: "Llegada registrada", clase: "badge--success" },
  cita_reprogramada: { texto: "Cita reprogramada", clase: "badge--success" },
  cita_cancelada: { texto: "Cita cancelada", clase: "badge--error" },
};

// Respuestas rápidas según lo último que dijo el asistente: así se
// puede tocar una opción en vez de escribirla.
function sugerenciasPara(texto) {
  if (/¿\s*confirma/i.test(texto)) return ["Sí, confirmo", "No, quiero cambiar algo"];
  return [...texto.matchAll(/^[ \t]*(\d)[.)][ \t]+(\S.*)$/gm)]
    .slice(0, 3)
    .map((m) => `${m[1]}. ${m[2].trim()}`);
}

function TarjetaCita({ cita, tipo }) {
  const encabezado = TARJETAS[tipo] ?? TARJETAS.cita_agendada;
  return (
    <div className="eli-cita">
      <div className="eli-cita__cabeza">
        <span className={`badge ${encabezado.clase}`}>{encabezado.texto}</span>
        <span className="eli-cita__numero">{cita.numero_comprobante}</span>
      </div>
      <div className="summary-row">
        <span className="summary-row__label">Especialista</span>
        <span className="summary-row__value">{cita.profesional}</span>
      </div>
      <div className="summary-row">
        <span className="summary-row__label">Especialidad</span>
        <span className="summary-row__value">{cita.especialidad}</span>
      </div>
      <div className="summary-row">
        <span className="summary-row__label">Sede</span>
        <span className="summary-row__value">
          {cita.sede} · {cita.ciudad}
        </span>
      </div>
      <div className="summary-row">
        <span className="summary-row__label">Modalidad</span>
        <span className="summary-row__value">{capitalizar(cita.modalidad)}</span>
      </div>
      <div className="summary-row">
        <span className="summary-row__label">Fecha y hora</span>
        <span className="summary-row__value">
          {formatearFecha(cita.fecha)}, {formatearHora(cita.hora)}
        </span>
      </div>
      <div className="summary-row">
        <span className="summary-row__label">Recordatorio por</span>
        <span className="summary-row__value">{CANALES[cita.recordatorio_por] ?? cita.recordatorio_por}</span>
      </div>
    </div>
  );
}

/** La cita que Eli propone y espera el "sí" (todavía no está agendada). */
function Propuesta({ propuesta: p }) {
  return (
    <>
      <div className="eli-propuesta">
        <div>
          <p className="eli-propuesta__titulo">
            {p.especialidad} · {cuandoEs(p.fecha)}
          </p>
          <p className="eli-propuesta__detalle">
            {formatearHora(p.hora)} · {p.sede} · {capitalizar(p.modalidad)}
          </p>
          <p className="eli-propuesta__detalle">{p.profesional}</p>
        </div>
        <span className="eli-propuesta__circulo" aria-hidden="true">
          <Chevron />
        </span>
      </div>
      <p className="eli-burbuja__nota">
        ¿No le sirve? Elija <strong>otra fecha</strong> o envíe una <strong>carta de petición</strong> para una cita a
        su medida.
      </p>
    </>
  );
}

function Mensaje({ mensaje }) {
  if (mensaje.rol === "paciente") {
    return <div className="eli-burbuja eli-burbuja--paciente">{mensaje.texto}</div>;
  }

  if (mensaje.rol === "aviso") {
    return <div className="alert alert--error eli-aviso">{mensaje.texto}</div>;
  }

  if (mensaje.tipo === "urgencia") {
    return (
      <div className="eli-urgencia" role="alert">
        {mensaje.texto}
        <div className="eli-urgencia__acciones">
          <a className="btn eli-urgencia__llamar" href="tel:123">
            Llamar al 123
          </a>
          {mensaje.texto.includes("192") && (
            <a className="btn btn--outline" href="tel:192">
              Llamar a la Línea 192
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="eli-burbuja eli-burbuja--eli">
        <p className="eli-burbuja__texto">{mensaje.texto}</p>
        {mensaje.propuesta && <Propuesta propuesta={mensaje.propuesta} />}
      </div>
      {mensaje.cita && <TarjetaCita cita={mensaje.cita} tipo={mensaje.tipo} />}
    </>
  );
}

function IconoMicrofono() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconoEnviar() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Eli, la guía de SaludYA. Se abre y se cierra desde afuera (`abierto`,
 * `onAbrir`, `onCerrar`): con su botón flotante en computador o con la
 * pestaña "Eli" de la barra inferior en celular (ver EncabezadoPaciente).
 *
 * `onCambioCitas` (opcional): se llama cuando el asistente agenda,
 * cancela, reprograma o confirma una cita, para que la página que lo
 * contiene (p. ej. "Mis citas") actualice lo que muestra.
 */
export default function AsistenteChat({ abierto, onAbrir, onCerrar, onCambioCitas }) {
  const { paciente, cerrarSesion } = useAuth();

  const [mensajes, setMensajes] = useState([]);
  const [historialCargado, setHistorialCargado] = useState(false);
  const [texto, setTexto] = useState("");
  const [esperando, setEsperando] = useState(false);
  const dictado = useDictado(setTexto);

  const idRef = useRef(0);
  const finRef = useRef(null);
  const entradaRef = useRef(null);

  const nuevoId = () => ++idRef.current;

  // Al abrir por primera vez se recupera la conversación que el
  // backend recuerda (p. ej., si el paciente recargó la página).
  useEffect(() => {
    if (!abierto || historialCargado) return;
    obtenerConversacion()
      .then((historial) => setMensajes(historial.map((m) => ({ id: nuevoId(), rol: m.rol, texto: m.texto }))))
      .catch(() => {
        // Si falla, simplemente se empieza con el chat vacío.
      })
      .finally(() => setHistorialCargado(true));
  }, [abierto, historialCargado]);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ block: "end" });
  }, [abierto, mensajes, esperando]);

  useEffect(() => {
    if (abierto && !esperando) entradaRef.current?.focus();
  }, [abierto, esperando]);

  useEffect(() => {
    if (!abierto) return;
    function manejarEscape(evento) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", manejarEscape);
    return () => document.removeEventListener("keydown", manejarEscape);
  }, [abierto, onCerrar]);

  async function enviar(contenido) {
    const limpio = contenido.trim();
    if (!limpio || esperando) return;
    if (dictado.escuchando) dictado.alternar();

    const idPaciente = nuevoId();
    setMensajes((prev) => [...prev, { id: idPaciente, rol: "paciente", texto: limpio }]);
    setTexto("");
    setEsperando(true);

    try {
      const r = await enviarMensaje(limpio);
      setMensajes((prev) => [
        ...prev,
        { id: nuevoId(), rol: "asistente", texto: r.respuesta, tipo: r.tipo, cita: r.cita, propuesta: r.propuesta },
      ]);
      if (r.cita) onCambioCitas?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        cerrarSesion();
        return;
      }
      // El backend descarta el mensaje que falló: se quita de la
      // pantalla y se devuelve al campo para reenviarlo con un toque.
      setMensajes((prev) => [
        ...prev.filter((m) => m.id !== idPaciente),
        { id: nuevoId(), rol: "aviso", texto: err.message },
      ]);
      setTexto(limpio);
    } finally {
      setEsperando(false);
    }
  }

  async function nuevaConversacion() {
    if (esperando) return;
    try {
      await reiniciarConversacion();
      setMensajes([]);
    } catch (err) {
      setMensajes((prev) => [...prev, { id: nuevoId(), rol: "aviso", texto: err.message }]);
    }
  }

  if (!abierto) {
    return (
      <div className="eli-lanzador">
        {/* Cada 12 s el botón vibra y aparece esta nube (decorativa: el botón ya dice qué hace). */}
        <p className="eli-lanzador__nube" aria-hidden="true">
          ¿Necesita ayuda para agendar, escribir una carta de petición o con cualquier otro trámite?{" "}
          <strong>Yo le ayudo.</strong>
        </p>
        <button type="button" className="eli-lanzador__boton" onClick={onAbrir}>
          <EliAvatar tamano={46} />
          <span className="eli-lanzador__textos">
            <span className="eli-lanzador__titulo">Pregúntele a Eli</span>
            <span className="eli-lanzador__subtitulo">Su guía de SaludYA</span>
          </span>
        </button>
      </div>
    );
  }

  const ultimo = mensajes.at(-1);
  const propuesta = !esperando && ultimo?.rol === "asistente" ? ultimo.propuesta : null;
  let sugerencias = [];
  if (!esperando && !propuesta) {
    if (mensajes.length === 0) sugerencias = SUGERENCIAS_INICIALES;
    else if (ultimo?.rol === "asistente" && ultimo.tipo !== "urgencia") sugerencias = sugerenciasPara(ultimo.texto);
  }
  const primerNombre = paciente?.nombre?.split(" ")[0] ?? "";
  const conTexto = texto.trim().length > 0;
  // Mientras escucha, el botón sirve para detener el dictado; luego, para enviar.
  const botonEnviar = !dictado.escuchando && (conTexto || !dictado.disponible);

  return (
    <dialog open className="eli-panel" aria-label="Eli, su guía de SaludYA">
      <header className="eli-panel__cabeza">
        <EliAvatar tamano={52} />
        <div className="eli-panel__quien">
          <h2>Eli</h2>
          <p>
            <span className="eli-panel__en-linea">● En línea</span> · Su guía de SaludYA
          </p>
        </div>
        <button
          type="button"
          className="eli-panel__boton"
          onClick={nuevaConversacion}
          disabled={esperando || mensajes.length === 0}
          aria-label="Nueva conversación"
          title="Nueva conversación"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path
              d="M4 12a8 8 0 1 0 2.34-5.66M4 4v4.5h4.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button type="button" className="eli-panel__boton" onClick={onCerrar} aria-label="Cerrar a Eli">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="eli-panel__mensajes" aria-live="polite">
        {historialCargado && mensajes.length === 0 && (
          <div className="eli-burbuja eli-burbuja--eli">
            <p className="eli-burbuja__texto">
              {`Hola, ${primerNombre}. Soy Eli, su guía de SaludYA.\nCuénteme qué necesita, por ejemplo: "Necesito una cita de dermatología para mañana".`}
            </p>
          </div>
        )}
        {mensajes.map((m) => (
          <Mensaje key={m.id} mensaje={m} />
        ))}
        {esperando && (
          <div className="eli-burbuja eli-burbuja--eli eli-escribiendo">
            <span className="sr-only">Eli está escribiendo…</span>
            <span className="eli-escribiendo__punto" aria-hidden="true" />
            <span className="eli-escribiendo__punto" aria-hidden="true" />
            <span className="eli-escribiendo__punto" aria-hidden="true" />
          </div>
        )}

        {propuesta && (
          <div className="eli-rapidas" role="group" aria-label="Respuestas rápidas">
            <button type="button" className="eli-rapida eli-rapida--principal" onClick={() => enviar(AGENDAR_PROPUESTA)}>
              Agendar esa cita
            </button>
            <button type="button" className="eli-rapida" onClick={() => enviar(OTRA_FECHA)}>
              Elegir otra fecha
            </button>
            <Link
              className="eli-rapida"
              to={`/solicitudes?tipo=formal&especialidad=${propuesta.especialidad_id}`}
              onClick={onCerrar}
            >
              Escribir carta de petición
            </Link>
          </div>
        )}
        {sugerencias.length > 0 && (
          <div className="eli-rapidas" role="group" aria-label="Respuestas rápidas">
            {sugerencias.map((s) => (
              <button key={s} type="button" className="eli-rapida" onClick={() => enviar(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={finRef} />
      </div>

      <form
        className="eli-panel__entrada"
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(texto);
        }}
      >
        {dictado.error && (
          <p className="eli-panel__dictado-error" role="status">
            {dictado.error}
          </p>
        )}
        <div className="eli-panel__fila">
          <input
            ref={entradaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              dictado.escuchando ? "Le escucho… hable ahora" : dictado.disponible ? "Escriba o hable…" : "Escriba aquí su mensaje"
            }
            aria-label="Escriba su mensaje"
            maxLength={1000}
            autoComplete="off"
            disabled={esperando}
          />
          {botonEnviar ? (
            <button
              className="eli-panel__enviar"
              type="submit"
              disabled={esperando || !conTexto}
              aria-label="Enviar"
            >
              <IconoEnviar />
            </button>
          ) : (
            <button
              className={`eli-panel__enviar ${dictado.escuchando ? "is-escuchando" : ""}`}
              type="button"
              onClick={dictado.alternar}
              disabled={esperando}
              aria-label={dictado.escuchando ? "Dejar de escuchar" : "Hablar: dictar el mensaje"}
              aria-pressed={dictado.escuchando}
            >
              <IconoMicrofono />
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
