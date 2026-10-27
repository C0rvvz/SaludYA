import { useCallback, useEffect, useState } from "react";
import {
  cancelarRecordatorio,
  editarRecordatorio,
  listarProgramados,
  listarRecordatorios,
  obtenerPlantillas,
  programarRecordatorio,
  reintentarRecordatorio,
} from "../../api/admin";
import { BotonIcono, IconoEditar, IconoQuitar, IconoReintentar } from "../../components/admin/IconosAdmin";
import FechaHora from "../../components/FechaHora";
import { iniciales } from "../../utils/avatar";
import { CANALES } from "../../utils/citas";
import { formatearFecha, formatearFechaHora, formatearHora, ocultarEnlaces } from "../../utils/formato";

/**
 * Recordatorios — HU-67: en un solo apartado, la lista de pacientes con
 * sus recordatorios (HU-63), el filtro por canal (HU-62) y la
 * programación de mensajes escritos (HU-64) y llamadas (HU-65) con
 * plantillas (HU-66). Los programados se pueden editar o cancelar
 * mientras no salgan, y reintentar si fallaron.
 */

// HU-63, criterio 4: solo lo que se sabe (leído y entregado requieren WhatsApp real).
const ESTADO_ENVIO = {
  enviado: ["Enviado", "badge--neutral"],
  respondido: ["Respondido", "badge--success"],
  fallido: ["Fallido", "badge--error"],
};

const ESTADO_PROGRAMADO = {
  pendiente: ["Programado", "badge--info"],
  enviado: ["Enviado", "badge--success"],
  fallido: ["Fallido", "badge--error"],
  cancelado: ["Cancelado", "badge--neutral"],
};

const CANALES_ESCRITOS = ["whatsapp", "sms", "correo"];

// "AAAA-MM-DDTHH:mm" en hora local, para <input type="datetime-local">
const aLocal = (fecha) =>
  new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function Insignia({ estados, estado }) {
  if (!estado) return <span className="texto-suave">Sin envíos</span>;
  const [texto, clase] = estados[estado];
  return <span className={`badge ${clase}`}>{texto}</span>;
}

/**
 * HU-64 / HU-65 / HU-66: programar un mensaje escrito o una llamada para
 * un paciente. Con `programado`, edita ese recordatorio.
 */
function PanelProgramar({ paciente, programado, onListo, onCancelar }) {
  const preferido = programado?.canal ?? paciente.canal_preferido;
  const [tipo, setTipo] = useState(preferido === "llamada" ? "llamada" : "mensaje");
  const [canal, setCanal] = useState(CANALES_ESCRITOS.includes(preferido) ? preferido : "whatsapp");
  const [citaId, setCitaId] = useState(
    programado ? (programado.cita_id ?? "") : (paciente.citas_activas[0]?.id ?? "")
  );
  const [plantillas, setPlantillas] = useState([]);
  const [plantilla, setPlantilla] = useState(programado?.plantilla ?? "");
  const [texto, setTexto] = useState(programado?.texto ?? "");
  const [cuando, setCuando] = useState(programado ? aLocal(new Date(programado.programado_para)) : "");
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
    const datos = {
      cita_id: citaId || null,
      canal: tipo === "llamada" ? "llamada" : canal,
      plantilla: plantilla || null,
      texto,
      programado_para: cuando,
    };
    try {
      if (programado) await editarRecordatorio(programado.id, datos);
      else await programarRecordatorio({ ...datos, paciente_id: paciente.paciente_id });
      const que = tipo === "llamada" ? "la llamada" : `el mensaje por ${CANALES[canal]}`;
      onListo(
        `Se ${programado ? "reprogramó" : "programó"} ${que} a ${paciente.nombre} para el ${formatearFechaHora(cuando)}.`
      );
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form className="card formulario-admin" onSubmit={programar} aria-labelledby="titulo-programar">
      <div className="admin-card__cabeza">
        <h2 className="admin-card__titulo" id="titulo-programar">
          {programado ? "Editar" : "Programar"} recordatorio para {paciente.nombre}
        </h2>
        <span className="admin-card__dato">Doc. {paciente.numero_documento}</span>
      </div>
      {error && <div className="alert alert--error">{error}</div>}

      <div className="campos-admin campos-admin--tres">
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
            min={aLocal(new Date())}
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="texto_recordatorio">{tipo === "llamada" ? "Mensaje de voz de la llamada" : "Mensaje"}</label>
        <textarea
          id="texto_recordatorio"
          rows={3}
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
          {programado ? "Guardar cambios" : "Programar"}
        </button>
        <button className="btn btn--outline btn--texto-peligro" type="button" onClick={onCancelar}>
          No, volver
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
  const [seleccionado, setSeleccionado] = useState(null); // { paciente, programado? }
  const [cancelando, setCancelando] = useState(null); // id del programado a confirmar
  const [ocupado, setOcupado] = useState(false);

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

  // HU-62: "Todos los canales" no filtra; un canal muestra los pacientes asociados a él.
  const visibles = canal ? pacientes.filter((p) => p.canal_preferido === canal) : pacientes;
  const cuantos = (valor) => pacientes.filter((p) => p.canal_preferido === valor).length;

  function abrir(paciente, programado = null) {
    setAviso("");
    setSeleccionado({ paciente, programado });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function accion(fn, mensaje) {
    setOcupado(true);
    setAviso("");
    setError("");
    try {
      setAviso(mensaje(await fn()));
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
      setCancelando(null);
    }
  }

  return (
    <>
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Recordatorios</h1>
          <p className="admin-subtitulo">
            Seguimiento de los avisos enviados a los pacientes y programación de mensajes o llamadas. El estado de
            lectura y entrega estará disponible con la integración oficial de WhatsApp.
          </p>
        </div>
      </div>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {seleccionado && (
        <PanelProgramar
          key={`${seleccionado.paciente.paciente_id}-${seleccionado.programado?.id ?? "nuevo"}`}
          paciente={seleccionado.paciente}
          programado={seleccionado.programado}
          onCancelar={() => setSeleccionado(null)}
          onListo={(mensaje) => {
            setSeleccionado(null);
            setAviso(mensaje);
            cargar();
          }}
        />
      )}

      <div className="chips-estado" role="group" aria-label="Filtrar por canal preferido">
        {[["", "Todos los canales", pacientes.length], ...Object.entries(CANALES).map(([v, n]) => [v, n, cuantos(v)])].map(
          ([valor, nombre, total]) => (
            <button
              key={valor || "todos"}
              type="button"
              className={`chip-estado ${canal === valor ? "is-activo" : ""}`}
              aria-pressed={canal === valor}
              onClick={() => setCanal(valor)}
            >
              {nombre} <span className="chip-estado__conteo">{total}</span>
            </button>
          )
        )}
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
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.paciente_id}>
                <td>
                  <span className="celda-persona">
                    <span className="celda-persona__iniciales" aria-hidden="true">
                      {iniciales(p.nombre)}
                    </span>
                    <span className="celda-persona__textos">
                      <span className="celda-persona__nombre">{p.nombre}</span>
                      <span className="celda-persona__dato">Doc. {p.numero_documento}</span>
                    </span>
                  </span>
                </td>
                <td>{p.canal_preferido ? CANALES[p.canal_preferido] : "—"}</td>
                <td>
                  <FechaHora valor={p.ultimo_envio_en} />
                  {p.ultimo_envio && <span className="texto-suave">{p.ultimo_envio}</span>}
                </td>
                <td>
                  <Insignia estados={ESTADO_ENVIO} estado={p.estado} />
                </td>
                <td>
                  <FechaHora valor={p.proximo_programado_en} />
                </td>
                <td>
                  <button className="btn btn--outline btn--compacto" onClick={() => abrir(p)}>
                    Programar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && visibles.length === 0 && <p className="tabla-vacia">No hay pacientes con ese canal.</p>}
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
              <th>Programado por</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {programados.map((r) => (
              <tr key={r.id}>
                <td>
                  <FechaHora valor={r.programado_para} />
                </td>
                <td>{r.paciente_nombre}</td>
                <td>{r.canal === "llamada" ? "Llamada automática" : CANALES[r.canal]}</td>
                <td>
                  <span className="celda-texto celda-texto--corta" title={ocultarEnlaces(r.texto)}>
                    {ocultarEnlaces(r.texto)}
                  </span>
                </td>
                <td>
                  <Insignia estados={ESTADO_PROGRAMADO} estado={r.estado} />
                  {r.estado === "pendiente" && r.intentos > 0 && (
                    <span className="texto-suave">Reintentando ({r.intentos} fallidos)</span>
                  )}
                  {r.estado === "fallido" && <span className="texto-suave">{r.intentos} intentos</span>}
                </td>
                <td>{r.programado_por}</td>
                <td>
                  {cancelando === r.id ? (
                    <div className="confirmar-fila">
                      <span>¿Cancelar este recordatorio?</span>
                      <button
                        className="btn btn--peligro btn--compacto"
                        disabled={ocupado}
                        onClick={() => accion(() => cancelarRecordatorio(r.id), () => "Se canceló el recordatorio.")}
                      >
                        Sí, cancelar
                      </button>
                      <button
                        className="btn btn--outline btn--texto-peligro btn--compacto"
                        onClick={() => setCancelando(null)}
                      >
                        No, volver
                      </button>
                    </div>
                  ) : (
                    ["pendiente", "fallido"].includes(r.estado) && (
                      <div className="acciones-tabla">
                        {r.estado === "fallido" && (
                          <BotonIcono
                            nombre={`Reintentar el envío a ${r.paciente_nombre}`}
                            disabled={ocupado}
                            onClick={() =>
                              accion(
                                () => reintentarRecordatorio(r.id),
                                (x) =>
                                  x.estado === "enviado"
                                    ? "El recordatorio se envió."
                                    : "No salió otra vez; se reintentará automáticamente en unos minutos."
                              )
                            }
                          >
                            <IconoReintentar />
                          </BotonIcono>
                        )}
                        <BotonIcono
                          nombre={`Editar el recordatorio de ${r.paciente_nombre}`}
                          disabled={ocupado}
                          onClick={() => abrir(pacientes.find((p) => p.paciente_id === r.paciente_id), r)}
                        >
                          <IconoEditar />
                        </BotonIcono>
                        <BotonIcono
                          nombre={`Cancelar el recordatorio de ${r.paciente_nombre}`}
                          peligro
                          disabled={ocupado}
                          onClick={() => setCancelando(r.id)}
                        >
                          <IconoQuitar />
                        </BotonIcono>
                      </div>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && programados.length === 0 && (
          <p className="tabla-vacia">Todavía no se ha programado ningún mensaje ni llamada.</p>
        )}
      </div>
    </>
  );
}
