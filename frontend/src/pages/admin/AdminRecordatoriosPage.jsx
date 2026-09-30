import { useCallback, useEffect, useState } from "react";
import {
  listarProgramados,
  listarRecordatorios,
  obtenerPlantillas,
  programarRecordatorio,
} from "../../api/admin";
import { CANALES } from "../../utils/citas";
import { formatearFecha, formatearFechaHora, formatearHora } from "../../utils/formato";

/**
 * Centro de recordatorios — HU-67: en un solo apartado, la lista de
 * pacientes con sus recordatorios (HU-63), el filtro por canal (HU-62)
 * y la programación de mensajes escritos (HU-64) y llamadas (HU-65) con
 * plantillas (HU-66).
 */

// HU-63, criterio 4: solo lo que se sabe (leído y entregado requieren WhatsApp real).
const ESTADO_ENVIO = {
  enviado: ["Enviado", "badge--neutral"],
  respondido: ["Respondido", "badge--success"],
  fallido: ["Falló", "badge--error"],
};

const ESTADO_PROGRAMADO = {
  pendiente: ["Programado", "badge--warning"],
  enviado: ["Enviado", "badge--success"],
  fallido: ["Falló", "badge--error"],
};

const CANALES_ESCRITOS = ["whatsapp", "sms", "correo"];

// "AAAA-MM-DDTHH:mm" en hora local, para <input type="datetime-local">
const ahoraLocal = () => {
  const ahora = new Date();
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function Insignia({ estados, estado }) {
  if (!estado) return <span className="texto-suave">Sin envíos</span>;
  const [texto, clase] = estados[estado];
  return <span className={`badge ${clase}`}>{texto}</span>;
}

/** HU-64 / HU-65 / HU-66: programar un mensaje escrito o una llamada para un paciente. */
function PanelProgramar({ paciente, onListo, onCancelar }) {
  const preferido = paciente.canal_preferido;
  const [tipo, setTipo] = useState(preferido === "llamada" ? "llamada" : "mensaje");
  const [canal, setCanal] = useState(CANALES_ESCRITOS.includes(preferido) ? preferido : "whatsapp");
  const [citaId, setCitaId] = useState(paciente.citas_activas[0]?.id ?? "");
  const [plantillas, setPlantillas] = useState([]);
  const [plantilla, setPlantilla] = useState("");
  const [texto, setTexto] = useState("");
  const [cuando, setCuando] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    obtenerPlantillas(paciente.paciente_id, citaId)
      .then(setPlantillas)
      .catch((err) => setError(err.message));
  }, [paciente.paciente_id, citaId]);

  function elegirPlantilla(clave) {
    setPlantilla(clave);
    const elegida = plantillas.find((p) => p.clave === clave);
    if (elegida?.texto) setTexto(elegida.texto);
  }

  async function programar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError("");
    try {
      await programarRecordatorio({
        paciente_id: paciente.paciente_id,
        cita_id: citaId || null,
        canal: tipo === "llamada" ? "llamada" : canal,
        plantilla: plantilla || null,
        texto,
        programado_para: cuando,
      });
      const que = tipo === "llamada" ? "la llamada" : `el mensaje por ${CANALES[canal]}`;
      onListo(`Se programó ${que} a ${paciente.nombre} para el ${formatearFechaHora(cuando)}.`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="card formulario-admin" onSubmit={programar}>
      <h2 className="admin-card__titulo">Programar recordatorio para {paciente.nombre}</h2>
      {error && <div className="alert alert--error">{error}</div>}

      <div className="filtros-admin">
        <div className="field">
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="mensaje">Mensaje escrito</option>
            <option value="llamada">Llamada</option>
          </select>
        </div>
        {tipo === "mensaje" && (
          <div className="field">
            <label htmlFor="canal_envio">Canal</label>
            <select id="canal_envio" value={canal} onChange={(e) => setCanal(e.target.value)}>
              {CANALES_ESCRITOS.map((c) => (
                <option key={c} value={c}>
                  {CANALES[c]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="cita">Cita</label>
          <select
            id="cita"
            value={citaId}
            onChange={(e) => {
              setCitaId(e.target.value);
              setPlantilla("");
            }}
          >
            <option value="">Ninguna en particular</option>
            {paciente.citas_activas.map((c) => (
              <option key={c.id} value={c.id}>
                {formatearFecha(c.fecha)}, {formatearHora(c.hora)} · {c.especialidad}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="plantilla">Plantilla</label>
          <select id="plantilla" value={plantilla} onChange={(e) => elegirPlantilla(e.target.value)}>
            <option value="">Texto libre</option>
            {plantillas.map((p) => (
              <option key={p.clave} value={p.clave} disabled={!p.texto}>
                {p.nombre}
                {!p.texto && " (elija una cita)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cuando">Fecha y hora del envío</label>
          <input
            id="cuando"
            type="datetime-local"
            required
            min={ahoraLocal()}
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="texto_recordatorio">
          {tipo === "llamada" ? "Mensaje de voz de la llamada" : "Mensaje"}
        </label>
        <textarea
          id="texto_recordatorio"
          rows={4}
          maxLength={1000}
          required
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {tipo === "llamada" && (
          <span className="texto-suave">
            Se llamará al {paciente.telefono_whatsapp} con este mensaje de voz automático (simulado).
          </span>
        )}
      </div>

      <div className="acciones-admin">
        <button className="btn btn--primary" type="submit" disabled={enviando || !texto.trim() || !cuando}>
          Programar
        </button>
        <button className="btn btn--outline" type="button" onClick={onCancelar}>
          Volver
        </button>
      </div>
    </form>
  );
}

export default function AdminRecordatoriosPage() {
  const [pacientes, setPacientes] = useState([]);
  const [programados, setProgramados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [canal, setCanal] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);

  const cargar = useCallback(
    () =>
      Promise.all([listarRecordatorios(), listarProgramados()])
        .then(([lista, prog]) => {
          setPacientes(lista);
          setProgramados(prog);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setCargando(false)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // HU-62: "Todos" no filtra; un canal muestra los pacientes asociados a él.
  const visibles = canal ? pacientes.filter((p) => p.canal_preferido === canal) : pacientes;

  function abrir(paciente) {
    setAviso("");
    setSeleccionado(paciente);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <h1 className="admin-titulo">Centro de recordatorios</h1>
      <p className="admin-subtitulo">
        Recordatorios de cada paciente y programación de mensajes y llamadas. Leído y entregado solo se sabrán
        con la integración real de WhatsApp.
      </p>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {seleccionado && (
        <PanelProgramar
          key={seleccionado.paciente_id}
          paciente={seleccionado}
          onCancelar={() => setSeleccionado(null)}
          onListo={(mensaje) => {
            setSeleccionado(null);
            setAviso(mensaje);
            cargar();
          }}
        />
      )}

      <div className="filters-card filtros-admin filtros-admin--periodo">
        <div className="field">
          <label htmlFor="canal">Canal</label>
          <select id="canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(CANALES).map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Canal preferido</th>
              <th>Último envío</th>
              <th>Estado</th>
              <th>Próximo programado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.paciente_id}>
                <td>
                  {p.nombre}
                  <span className="texto-suave">{p.numero_documento}</span>
                </td>
                <td>{p.canal_preferido ? CANALES[p.canal_preferido] : "—"}</td>
                <td>
                  {p.ultimo_envio_en ? formatearFechaHora(p.ultimo_envio_en) : "—"}
                  {p.ultimo_envio && <span className="texto-suave">{p.ultimo_envio}</span>}
                </td>
                <td>
                  <Insignia estados={ESTADO_ENVIO} estado={p.estado} />
                </td>
                <td>{p.proximo_programado_en ? formatearFechaHora(p.proximo_programado_en) : "—"}</td>
                <td>
                  <button className="btn btn--outline btn--compacto" onClick={() => abrir(p)}>
                    Programar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && visibles.length === 0 && <p className="empty-state">No hay pacientes con ese canal.</p>}
      </div>

      <h2 className="admin-titulo admin-titulo--seccion">Mensajes y llamadas programados</h2>
      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Paciente</th>
              <th>Tipo</th>
              <th>Mensaje</th>
              <th>Estado</th>
              <th>Programó</th>
            </tr>
          </thead>
          <tbody>
            {programados.map((r) => (
              <tr key={r.id}>
                <td>{formatearFechaHora(r.programado_para)}</td>
                <td>{r.paciente_nombre}</td>
                <td>{r.canal === "llamada" ? "Llamada" : `Mensaje por ${CANALES[r.canal]}`}</td>
                <td className="celda-texto">{r.texto}</td>
                <td>
                  <Insignia estados={ESTADO_PROGRAMADO} estado={r.estado} />
                </td>
                <td>{r.programado_por}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && programados.length === 0 && (
          <p className="empty-state">Todavía no se ha programado ningún mensaje ni llamada.</p>
        )}
      </div>
    </>
  );
}
