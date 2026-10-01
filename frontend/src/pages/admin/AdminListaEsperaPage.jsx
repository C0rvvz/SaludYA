import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  cambiarPrioridadListaEspera,
  cancelarDesdeListaEspera,
  confirmarDesdeListaEspera,
  horariosListaEspera,
  listarListaEsperaAdmin,
} from "../../api/admin";
import { Cifra } from "../../components/admin/Reportes";
import { usePersonal } from "../../context/personal";
import { CANALES } from "../../utils/citas";
import {
  capitalizar,
  formatearDuracion,
  formatearFecha,
  formatearFechaHora,
  formatearFechaLarga,
  formatearHora,
} from "../../utils/formato";

/**
 * Lista de espera del personal — HU-61: en una sola lista, nombre y
 * especialidad (HU-54), tiempo de espera (HU-54), horarios y sedes
 * (HU-55), prioridad médica (HU-56), canal (HU-57) y estado (HU-58), con
 * las acciones de confirmar (HU-59) y cancelar (HU-60). HU-45: cantidad
 * de pacientes en espera y el día consultado.
 */

const ESTADOS = {
  en_espera: ["En espera", "badge--warning"],
  cupo_ofrecido: ["Cupo ofrecido", "badge--neutral"],
  asignada: ["Asignada", "badge--success"],
  cancelada: ["Salió de la lista", "badge--error"],
};

const PRIORIDADES = [
  ["normal", "Normal", "badge--neutral"],
  ["alta", "Alta", "badge--warning"],
  ["urgente", "Urgente", "badge--error"],
];

const JORNADA = { cualquiera: "Cualquier hora", manana: "Mañana", tarde: "Tarde" };

const ACTIVAS = new Set(["en_espera", "cupo_ofrecido"]);
// Estados de la cita asignada que todavía se pueden cancelar.
const CITA_CANCELABLE = new Set(["Pendiente de confirmar asistencia", "Asistencia confirmada"]);

const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

/** HU-59: elegir uno de los horarios que se ajustan a la solicitud y confirmar la cita. */
function PanelConfirmar({ solicitud, ocupado, onConfirmar, onVolver }) {
  const [horarios, setHorarios] = useState(null);
  const [elegido, setElegido] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    horariosListaEspera(solicitud.id)
      .then((lista) => {
        setHorarios(lista);
        setElegido(lista[0]?.id ?? "");
      })
      .catch((err) => setError(err.message));
  }, [solicitud.id]);

  return (
    <div className="card formulario-admin">
      <h2 className="admin-card__titulo">
        Confirmar cita de {solicitud.especialidad} para {solicitud.paciente_nombre}
      </h2>
      {error && <div className="alert alert--error">{error}</div>}
      {horarios === null && !error && <p>Buscando horarios...</p>}
      {horarios?.length === 0 && (
        <p className="empty-state">No hay horarios libres que se ajusten a sus preferencias en este momento.</p>
      )}
      {horarios?.length > 0 && (
        <>
          <p className="texto-suave">Horarios que se ajustan a sus preferencias, del más próximo al más lejano.</p>
          <div className="channel-grid">
            {horarios.map((h) => (
              <label className="channel-card" key={h.id}>
                <input type="radio" name="horario" checked={elegido === h.id} onChange={() => setElegido(h.id)} />
                <span>
                  {formatearFechaLarga(h.fecha)}, {formatearHora(h.hora)}
                  <span className="texto-suave">
                    {h.especialista} · {h.sede} · {capitalizar(h.modalidad)}
                    {h.ofrecido && " · ya se le ofreció"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="acciones-admin">
        <button className="btn btn--success" disabled={ocupado || !elegido} onClick={() => onConfirmar(elegido)}>
          Confirmar cita
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </div>
  );
}

/** HU-60: sacar de la lista o, si ya tiene la cita asignada, cancelarla. */
function PanelCancelar({ solicitud, ocupado, onCancelar, onVolver }) {
  const [motivo, setMotivo] = useState("");
  const conCita = solicitud.estado === "asignada";
  return (
    <div className="card formulario-admin panel-admin--peligro">
      <h2 className="admin-card__titulo">
        {conCita
          ? `¿Cancelar la cita de ${solicitud.paciente_nombre}?`
          : `¿Sacar a ${solicitud.paciente_nombre} de la lista de ${solicitud.especialidad}?`}
      </h2>
      <p>
        {conCita
          ? `La cita del ${formatearFechaLarga(solicitud.cita.fecha)} a las ${formatearHora(solicitud.cita.hora)} se cancela y el horario se ofrece a la lista de espera.`
          : "Si tenía un cupo ofrecido, pasa al siguiente de la lista."}
      </p>
      <div className="field">
        <label htmlFor="motivo">Motivo (opcional)</label>
        <input id="motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <div className="acciones-admin">
        <button className="btn btn--peligro" disabled={ocupado} onClick={() => onCancelar(motivo)}>
          {conCita ? "Sí, cancelar la cita" : "Sí, sacar de la lista"}
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </div>
  );
}

function Estado({ s }) {
  const [texto, clase] = ESTADOS[s.estado];
  return (
    <>
      <span className={`badge ${clase}`}>{texto}</span>
      {s.oferta && (
        <span className="texto-suave">
          {formatearFecha(s.oferta.fecha)}, {formatearHora(s.oferta.hora)} · responde hasta{" "}
          {formatearFechaHora(s.oferta.expira_en)}
        </span>
      )}
      {s.cita && (
        <span className="texto-suave">
          Cita {formatearFecha(s.cita.fecha)}, {formatearHora(s.cita.hora)}: {s.cita.estado} ·{" "}
          <Link to={`/admin/citas/${s.cita.id}`}>Ver cita</Link>
        </span>
      )}
    </>
  );
}

export default function AdminListaEsperaPage() {
  const { tienePermiso } = usePersonal();
  const gestiona = tienePermiso("gestionar_citas");
  const asignaPrioridad = tienePermiso("asignar_prioridad");
  const [dia, setDia] = useState(hoy);
  const [soloEsperando, setSoloEsperando] = useState(true);
  const [orden, setOrden] = useState("lista");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [panel, setPanel] = useState(null); // { tipo: "confirmar" | "cancelar", solicitud }

  const cargar = useCallback(
    () =>
      listarListaEsperaAdmin(dia)
        .then((d) => {
          setDatos(d);
          setError("");
        })
        .catch((err) => setError(err.message)),
    [dia]
  );

  // HU-54 criterio 3 / HU-45 criterio 4: los tiempos y estados se refrescan solos cada minuto.
  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 60000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  async function accion(fn, mensaje) {
    setOcupado(true);
    setAviso("");
    setError("");
    try {
      setAviso(mensaje(await fn()));
      setPanel(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  function abrir(tipo, solicitud) {
    setAviso("");
    setPanel({ tipo, solicitud });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const todas = datos?.solicitudes ?? [];
  let visibles = soloEsperando ? todas.filter((s) => ACTIVAS.has(s.estado)) : todas;
  if (orden === "espera") visibles = [...visibles].sort((a, b) => b.minutos_espera - a.minutos_espera);
  const mayorEspera = Math.max(0, ...todas.filter((s) => ACTIVAS.has(s.estado)).map((s) => s.minutos_espera));

  return (
    <>
      <h1 className="admin-titulo">Lista de espera</h1>
      <p className="admin-subtitulo">
        Pacientes que esperan un cupo, en el orden de la lista: primero por prioridad médica y luego por antigüedad.
      </p>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {panel?.tipo === "confirmar" && (
        <PanelConfirmar
          key={panel.solicitud.id}
          solicitud={panel.solicitud}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onConfirmar={(disponibilidadId) =>
            accion(
              () => confirmarDesdeListaEspera(panel.solicitud.id, disponibilidadId),
              (s) =>
                `Cita confirmada para ${s.paciente_nombre}: ${formatearFechaLarga(s.cita.fecha)}, ${formatearHora(s.cita.hora)}. Comprobante ${s.cita.numero_comprobante}.`
            )
          }
        />
      )}
      {panel?.tipo === "cancelar" && (
        <PanelCancelar
          key={panel.solicitud.id}
          solicitud={panel.solicitud}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onCancelar={(motivo) =>
            accion(
              () => cancelarDesdeListaEspera(panel.solicitud.id, motivo),
              (s) =>
                s.estado === "cancelada"
                  ? `${s.paciente_nombre} salió de la lista de ${s.especialidad}.`
                  : `Se canceló la cita de ${s.paciente_nombre}.`
            )
          }
        />
      )}

      <div className="filters-card filtros-admin">
        <div className="field">
          <label htmlFor="dia">Día</label>
          <input id="dia" type="date" value={dia} max={hoy()} onChange={(e) => setDia(e.target.value || hoy())} />
        </div>
        <div className="field">
          <label htmlFor="mostrar">Mostrar</label>
          <select id="mostrar" value={soloEsperando ? "esperando" : "todas"} onChange={(e) => setSoloEsperando(e.target.value === "esperando")}>
            <option value="esperando">Solo los que siguen esperando</option>
            <option value="todas">Todas las solicitudes del día</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="orden">Ordenar por</label>
          <select id="orden" value={orden} onChange={(e) => setOrden(e.target.value)}>
            <option value="lista">Orden de la lista</option>
            <option value="espera">Mayor tiempo de espera</option>
          </select>
        </div>
      </div>

      {datos && (
        <div className="cifras lista-espera-admin__cifras">
          <Cifra valor={datos.esperando_ahora} nombre="Esperando cupo ahora" />
          <Cifra valor={todas.length} nombre="Estuvieron en la lista este día" />
          <Cifra valor={mayorEspera ? formatearDuracion(mayorEspera) : "—"} nombre="Mayor tiempo de espera" />
        </div>
      )}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Especialidad</th>
              <th>Tiempo de espera</th>
              <th>Horario</th>
              <th>Sedes</th>
              <th>Prioridad</th>
              <th>Canal</th>
              <th>Estado</th>
              {gestiona && <th></th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((s) => {
              const activa = ACTIVAS.has(s.estado);
              const prioridad = PRIORIDADES.find(([v]) => v === s.prioridad);
              return (
                <tr key={s.id}>
                  <td>
                    {s.paciente_nombre}
                    <span className="texto-suave">{s.numero_documento}</span>
                  </td>
                  <td>
                    {s.especialidad}
                    {s.posicion && <span className="texto-suave">Puesto {s.posicion} de {s.total_en_lista}</span>}
                  </td>
                  <td>
                    {formatearDuracion(s.minutos_espera)}
                    <span className="texto-suave">Desde {formatearFechaHora(s.creado_en)}</span>
                  </td>
                  <td>
                    {JORNADA[s.jornada]}
                    <span className="texto-suave">{s.modalidad ? capitalizar(s.modalidad) : "Presencial o virtual"}</span>
                  </td>
                  <td>{s.sedes.join(", ")}</td>
                  <td>
                    {asignaPrioridad && activa ? (
                      <select
                        aria-label={`Prioridad de ${s.paciente_nombre}`}
                        value={s.prioridad}
                        disabled={ocupado}
                        onChange={(e) =>
                          accion(
                            () => cambiarPrioridadListaEspera(s.id, e.target.value),
                            (r) => `Prioridad de ${r.paciente_nombre}: ${capitalizar(r.prioridad)}. Ahora es el puesto ${r.posicion}.`
                          )
                        }
                      >
                        {PRIORIDADES.map(([valor, texto]) => (
                          <option key={valor} value={valor}>
                            {texto}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge ${prioridad[2]}`}>{prioridad[1]}</span>
                    )}
                  </td>
                  <td>{CANALES[s.canal]}</td>
                  <td>
                    <Estado s={s} />
                  </td>
                  {gestiona && (
                    <td>
                      <div className="acciones-admin">
                        {activa && (
                          <button className="btn btn--success btn--compacto" onClick={() => abrir("confirmar", s)}>
                            Confirmar
                          </button>
                        )}
                        {(activa || CITA_CANCELABLE.has(s.cita?.estado)) && (
                          <button className="btn btn--peligro-outline btn--compacto" onClick={() => abrir("cancelar", s)}>
                            {activa ? "Sacar" : "Cancelar cita"}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {datos && visibles.length === 0 && (
          <p className="empty-state">
            {soloEsperando ? "Nadie está esperando cupo en este momento." : "No hubo solicitudes en la lista este día."}
          </p>
        )}
      </div>
    </>
  );
}
