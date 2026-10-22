import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { enviarMensaje, obtenerConversacion, reiniciarConversacion } from "../api/chat";
import { ApiError } from "../api/client";
import EliAvatar from "./EliAvatar";
import { CANALES } from "../utils/citas";
import { formatearFecha, formatearHora, capitalizar } from "../utils/formato";

/**
 * Asistente conversacional — HU-33.
 *
 * El paciente escribe libremente (o toca una sugerencia) y el resultado
 * llega dentro del mismo chat: una cita agendada se muestra como
 * tarjeta, y una urgencia como aviso destacado con botón para llamar.
 * Pensado para adultos mayores: letra grande, mensajes cortos y
 * respuestas rápidas para tocar en vez de escribir.
 */

// HU-33, criterio 1: sugerencias rápidas para empezar.
const SUGERENCIAS_INICIALES = ["Solicitar una cita", "Ver mis citas"];

// Encabezado de la tarjeta según la acción que hizo el asistente.
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
    <div className="card chat-cita">
      <div className="comprobante-header">
        <span className={`badge ${encabezado.clase}`}>{encabezado.texto}</span>
        <span className="comprobante-numero">{cita.numero_comprobante}</span>
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
        <span className="summary-row__value">
          {CANALES[cita.recordatorio_por] ?? cita.recordatorio_por}
        </span>
      </div>
    </div>
  );
}

function Mensaje({ mensaje }) {
  if (mensaje.rol === "paciente") {
    return <div className="chat-burbuja chat-burbuja--paciente">{mensaje.texto}</div>;
  }

  if (mensaje.rol === "aviso") {
    return <div className="alert alert--error chat-aviso">{mensaje.texto}</div>;
  }

  if (mensaje.tipo === "urgencia") {
    return (
      <div className="chat-urgencia" role="alert">
        {mensaje.texto}
        <div className="chat-urgencia__acciones">
          <a className="btn chat-urgencia__llamar" href="tel:123">
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
      <div className="chat-burbuja chat-burbuja--asistente">{mensaje.texto}</div>
      {mensaje.cita && <TarjetaCita cita={mensaje.cita} tipo={mensaje.tipo} />}
    </>
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

  const idRef = useRef(0);
  const finRef = useRef(null);
  const entradaRef = useRef(null);

  const nuevoId = () => ++idRef.current;

  // Al abrir por primera vez se recupera la conversación que el
  // backend recuerda (p. ej., si el paciente recargó la página).
  useEffect(() => {
    if (!abierto || historialCargado) return;
    obtenerConversacion()
      .then((historial) =>
        setMensajes(historial.map((m) => ({ id: nuevoId(), rol: m.rol, texto: m.texto })))
      )
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

    const idPaciente = nuevoId();
    setMensajes((prev) => [...prev, { id: idPaciente, rol: "paciente", texto: limpio }]);
    setTexto("");
    setEsperando(true);

    try {
      const r = await enviarMensaje(limpio);
      setMensajes((prev) => [
        ...prev,
        { id: nuevoId(), rol: "asistente", texto: r.respuesta, tipo: r.tipo, cita: r.cita },
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

  const ultimo = mensajes.at(-1);
  let sugerencias = [];
  if (!esperando) {
    if (mensajes.length === 0) sugerencias = SUGERENCIAS_INICIALES;
    else if (ultimo?.rol === "asistente" && ultimo.tipo !== "urgencia")
      sugerencias = sugerenciasPara(ultimo.texto);
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

  const primerNombre = paciente?.nombre?.split(" ")[0] ?? "";

  return (
    <dialog open className="chat-panel" aria-label="Eli, su guía de SaludYA">
      <header className="chat-panel__header">
        <div className="chat-panel__quien">
          <EliAvatar tamano={44} />
          <div>
            <h2>Eli</h2>
            <p>Su guía de SaludYA</p>
          </div>
        </div>
        <div className="chat-panel__acciones">
          <button
            type="button"
            className="chat-panel__nueva"
            onClick={nuevaConversacion}
            disabled={esperando || mensajes.length === 0}
          >
            Nueva conversación
          </button>
          <button
            type="button"
            className="chat-panel__cerrar"
            onClick={onCerrar}
            aria-label="Cerrar a Eli"
          >
            ×
          </button>
        </div>
      </header>

      <div className="chat-panel__mensajes" aria-live="polite">
        {historialCargado && mensajes.length === 0 && (
          <div className="chat-burbuja chat-burbuja--asistente">
            {`Hola, ${primerNombre}. Soy Eli, su guía de SaludYA.\nCuénteme qué necesita, por ejemplo: "Necesito una cita de dermatología para mañana".`}
          </div>
        )}
        {mensajes.map((m) => (
          <Mensaje key={m.id} mensaje={m} />
        ))}
        {esperando && (
          <div className="chat-burbuja chat-burbuja--asistente chat-burbuja--escribiendo">
            Escribiendo...
          </div>
        )}
        <div ref={finRef} />
      </div>

      {sugerencias.length > 0 && (
        <div className="chat-sugerencias">
          {sugerencias.map((s) => (
            <button key={s} type="button" className="chat-sugerencia" onClick={() => enviar(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat-panel__entrada"
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(texto);
        }}
      >
        <input
          ref={entradaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escriba aquí su mensaje"
          aria-label="Escriba su mensaje"
          maxLength={1000}
          autoComplete="off"
          disabled={esperando}
        />
        <button className="btn btn--primary" type="submit" disabled={esperando || !texto.trim()}>
          Enviar
        </button>
      </form>
    </dialog>
  );
}
