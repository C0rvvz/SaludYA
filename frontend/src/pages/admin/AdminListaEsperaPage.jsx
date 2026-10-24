import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  cambiarPrioridadListaEspera,
  cancelarDesdeListaEspera,
  confirmarDesdeListaEspera,
  horariosListaEspera,
  listarListaEsperaAdmin,
} from "../../api/admin";
import { BotonIcono, IconoConfirmar, IconoQuitar } from "../../components/admin/IconosAdmin";
import { Cifra } from "../../components/admin/Reportes";
import { usePersonal } from "../../context/personal";
import { iniciales } from "../../utils/avatar";
import { CANALES } from "../../utils/citas";
import { capitalizar, formatearDuracion, formatearFecha, formatearFechaLarga, formatearHora } from "../../utils/formato";
import { hastaCuando } from "../../utils/agendar";

/**
 * Lista de espera del personal — HU-61: en una sola lista, nombre y
 * especialidad (HU-54), tiempo de espera (HU-54), horarios y sedes
 * (HU-55), prioridad médica (HU-56), canal (HU-57) y estado (HU-58), con
 * las acciones de asignar una cita (HU-59) y retirar de la lista o
 * cancelar la cita asignada (HU-60). HU-45: cantidad de pacientes en
 * espera y el día consultado.
 */

const ESTADOS = {
  en_espera: ["En espera", "badge--warning"],
  cupo_ofrecido: ["Cupo ofrecido", "badge--info"],
  asignada: ["Cita asignada", "badge--success"],
  cancelada: ["Retirado de la lista", "badge--neutral"],
};

const PRIORIDADES = [
  ["normal", "Normal", "badge--neutral"],
  ["alta", "Alta", "badge--warning"],
  ["urgente", "Urgente", "badge--error"],
];

const JORNADA = { cualquiera: "Cualquier horario", manana: "Mañana", tarde: "Tarde" };

const ACTIVAS = new Set(["en_espera", "cupo_ofrecido"]);
// Estados de la cita asignada que todavía se pueden cancelar.
const CITA_CANCELABLE = new Set(["Pendiente de confirmar asistencia", "Asistencia confirmada"]);

const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

// "16 oct"
const diaCorto = (fechaIso) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
    .format(new Date(fechaIso))
    .replace(".", "")
    .replace(" de ", " ");

/** HU-59: elegir uno de los horarios que se ajustan a la solicitud y asignar la cita. */
function PanelAsignar({ solicitud, ocupado, onAsignar, onVolver }) {
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
    <section className="card formulario-admin" aria-labelledby="titulo-asignar">
      <h2 className="admin-card__titulo" id="titulo-asignar">
        Asignar cita de {solicitud.especialidad} a {solicitud.paciente_nombre}
      </h2>
      {error && <div className="alert alert--error">{error}</div>}
      {horarios === null && !error && <p className="texto-suave">Buscando horarios…</p>}
      {horarios?.length === 0 && (
        <p className="texto-suave">No hay horarios libres que se ajusten a sus preferencias en este momento.</p>
      )}
      {horarios?.length > 0 && (
        <fieldset className="opciones-admin">
          <legend>Horarios que se ajustan a sus preferencias, del más próximo al más lejano</legend>
          {horarios.map((h) => (
            <label className="opcion-admin" key={h.id}>
              <input type="radio" name="horario" checked={elegido === h.id} onChange={() => setElegido(h.id)} />
              <span className="opcion-admin__textos">
                <span className="opcion-admin__titulo">
                  {formatearFechaLarga(h.fecha)}, {formatearHora(h.hora)}
                </span>
                <span className="opcion-admin__detalle">
                  {h.especialista} · {h.sede} · {capitalizar(h.modalidad)}
                  {h.ofrecido && " · ya se le ofreció"}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="acciones-admin">
        <button className="btn btn--primary" disabled={ocupado || !elegido} onClick={() => onAsignar(elegido)}>
          Asignar cita
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </section>
  );
}

/** HU-60: retirar de la lista o, si ya tiene la cita asignada, cancelarla. */
function PanelRetirar({ solicitud, ocupado, onRetirar, onVolver }) {
  const [motivo, setMotivo] = useState("");
  const conCita = solicitud.estado === "asignada";
  return (
    <section className="card formulario-admin panel-admin--confirmar panel-admin--peligro" aria-labelledby="titulo-retirar">
      <h2 className="admin-card__titulo" id="titulo-retirar">
        {conCita
          ? `¿Cancelar la cita de ${solicitud.paciente_nombre}?`
          : `¿Retirar a ${solicitud.paciente_nombre} de la lista de ${solicitud.especialidad}?`}
      </h2>
      <p>
        {conCita
          ? `La cita del ${formatearFechaLarga(solicitud.cita.fecha)} a las ${formatearHora(solicitud.cita.hora)} se cancela y el horario se ofrece a la lista de espera.`
          : "Si tenía un cupo ofrecido, este pasa al siguiente paciente de la lista."}
      </p>
      <div className="field">
        <label htmlFor="motivo">Motivo (opcional)</label>
        <input id="motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <div className="acciones-admin">
        <button className="btn btn--peligro" disabled={ocupado} onClick={() => onRetirar(motivo)}>
          {conCita ? "Sí, cancelar la cita" : "Sí, retirar de la lista"}
        </button>
        <button className="btn btn--outline" onClick={onVolver}>
          Volver
        </button>
      </div>
    </section>
  );
}

function Estado({ s }) {
  const [texto, clase] = ESTADOS[s.estado];
  return (
    <span className="celda-doble">
      <span>
        <span className={`badge ${clase}`}>{texto}</span>
      </span>
      {s.oferta && (
        <span className="celda-doble__dato">
          {formatearFecha(s.oferta.fecha)}, {formatearHora(s.oferta.hora)} · respuesta {hastaCuando(s.oferta.expira_en)}
        </span>
      )}
      {s.cita && (
        <span className="celda-doble__dato">
          Cita {formatearFecha(s.cita.fecha)}, {formatearHora(s.cita.hora)}: {s.cita.estado} ·{" "}
          <Link to={`/admin/citas/${s.cita.id}`}>Ver cita</Link>
        </span>
      )}
    </span>
  );
}

export default function AdminListaEsperaPage() {
  const { tienePermiso } = usePersonal();
  const gestiona = tienePermiso("lista_espera"); // asignar la cita y retirar
  const asignaPrioridad = tienePermiso("asignar_prioridad"); // el coordinador médico solo ve la lista y la prioridad
  const [dia, setDia] = useState(hoy);
  const [soloEsperando, setSoloEsperando] = useState(true);
  const [orden, setOrden] = useState("lista");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [panel, setPanel] = useState(null); // { tipo: "asignar" | "retirar", solicitud }

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
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Lista de espera</h1>
          <p className="admin-subtitulo">
            Pacientes que solicitaron ser notificados cuando se libere un cupo. Los cupos se asignan por prioridad
            médica y, a igual prioridad, por orden de inscripción. También es posible asignar una cita directamente.
          </p>
        </div>
      </div>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {panel?.tipo === "asignar" && (
        <PanelAsignar
          key={panel.solicitud.id}
          solicitud={panel.solicitud}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onAsignar={(disponibilidadId) =>
            accion(
              () => confirmarDesdeListaEspera(panel.solicitud.id, disponibilidadId),
              (s) =>
                `Cita asignada a ${s.paciente_nombre}: ${formatearFechaLarga(s.cita.fecha)}, ${formatearHora(s.cita.hora)}. Comprobante ${s.cita.numero_comprobante}.`
            )
          }
        />
      )}
      {panel?.tipo === "retirar" && (
        <PanelRetirar
          key={panel.solicitud.id}
          solicitud={panel.solicitud}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onRetirar={(motivo) =>
            accion(
              () => cancelarDesdeListaEspera(panel.solicitud.id, motivo),
              (s) =>
                s.estado === "cancelada"
                  ? `Se retiró a ${s.paciente_nombre} de la lista de ${s.especialidad}.`
                  : `Se canceló la cita de ${s.paciente_nombre}.`
            )
          }
        />
      )}

      <div className="filtros-admin">
        <div className="field">
          <label htmlFor="dia">Fecha</label>
          <input id="dia" type="date" value={dia} max={hoy()} onChange={(e) => setDia(e.target.value || hoy())} />
        </div>
        <div className="field">
          <label htmlFor="mostrar">Mostrar</label>
          <select
            id="mostrar"
            value={soloEsperando ? "esperando" : "todas"}
            onChange={(e) => setSoloEsperando(e.target.value === "esperando")}
          >
            <option value="esperando">Solo pacientes en espera</option>
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
        <section className="card" aria-label="Resumen de la lista de espera">
          <div className="cifras">
            <Cifra valor={datos.esperando_ahora} nombre="En espera actualmente" />
            <Cifra valor={todas.length} nombre="Inscritos en el día" />
            <Cifra valor={mayorEspera ? formatearDuracion(mayorEspera) : "—"} nombre="Mayor tiempo de espera" />
          </div>
        </section>
      )}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Especialidad</th>
              <th>Tiempo de espera</th>
              <th>Preferencia</th>
              <th>Sedes</th>
              <th>Prioridad</th>
              <th>Canal</th>
              <th>Estado</th>
              {gestiona && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((s) => {
              const activa = ACTIVAS.has(s.estado);
              const prioridad = PRIORIDADES.find(([v]) => v === s.prioridad);
              return (
                <tr key={s.id}>
                  <td>
                    <span className="celda-persona">
                      <span className="celda-persona__iniciales" aria-hidden="true">
                        {iniciales(s.paciente_nombre)}
                      </span>
                      <span className="celda-persona__textos">
                        <span className="celda-persona__nombre">{s.paciente_nombre}</span>
                        <span className="celda-persona__dato">Doc. {s.numero_documento}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="celda-doble">
                      <span>{s.especialidad}</span>
                      {s.posicion && (
                        <span className="celda-doble__dato">
                          Posición {s.posicion} de {s.total_en_lista}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="celda-doble celda-doble--fija">
                      <span>{formatearDuracion(s.minutos_espera)}</span>
                      <span className="celda-doble__dato">Desde el {diaCorto(s.creado_en)}</span>
                    </span>
                  </td>
                  <td>
                    <span className="celda-doble">
                      <span>{JORNADA[s.jornada]}</span>
                      <span className="celda-doble__dato">
                        {s.modalidad ? capitalizar(s.modalidad) : "Presencial o virtual"}
                      </span>
                    </span>
                  </td>
                  <td>{s.sedes.map((sede) => sede.replace(/^Sede\s+/i, "")).join(", ")}</td>
                  <td>
                    {asignaPrioridad && activa ? (
                      <select
                        aria-label={`Prioridad de ${s.paciente_nombre}`}
                        value={s.prioridad}
                        disabled={ocupado}
                        onChange={(e) =>
                          accion(
                            () => cambiarPrioridadListaEspera(s.id, e.target.value),
                            (r) =>
                              `Prioridad de ${r.paciente_nombre}: ${capitalizar(r.prioridad)}. Ahora es el puesto ${r.posicion}.`
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
                      <div className="acciones-tabla">
                        {activa && (
                          <BotonIcono nombre={`Asignar cita a ${s.paciente_nombre}`} onClick={() => abrir("asignar", s)}>
                            <IconoConfirmar />
                          </BotonIcono>
                        )}
                        {activa && (
                          <BotonIcono
                            nombre={`Retirar a ${s.paciente_nombre} de la lista`}
                            peligro
                            onClick={() => abrir("retirar", s)}
                          >
                            <IconoQuitar />
                          </BotonIcono>
                        )}
                        {!activa && CITA_CANCELABLE.has(s.cita?.estado) && (
                          <BotonIcono
                            nombre={`Cancelar la cita de ${s.paciente_nombre}`}
                            peligro
                            onClick={() => abrir("retirar", s)}
                          >
                            <IconoQuitar />
                          </BotonIcono>
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
          <p className="tabla-vacia">
            {soloEsperando ? "Nadie está esperando cupo en este momento." : "No hubo solicitudes en la lista este día."}
          </p>
        )}
      </div>
    </>
  );
}
