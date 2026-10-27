import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cambiarEstadoEspecialista,
  cambiarHorarioEspecialista,
  crearEspecialista,
  listarEspecialistasAdmin,
  sincronizarIps,
} from "../../api/admin";
import { listarEspecialidades, listarSedes } from "../../api/catalogo";
import { BotonIcono, IconoBuscar, IconoEditar, IconoQuitar } from "../../components/admin/IconosAdmin";
import { CabezaTarjeta } from "../../components/admin/Reportes";
import FarmaciasDeLaRed from "../../components/admin/FarmaciasDeLaRed";
import SedesDeLaRed from "../../components/admin/SedesDeLaRed";
import FotoProfesional from "../../components/agendar/FotoProfesional";
import { formatearFechaHora, formatearSoloFecha } from "../../utils/formato";
import { DIAS, DURACIONES, ORIGEN_ESPECIALISTA, origenSincronizacion, resumenHorario } from "../../utils/especialistas";

/**
 * Especialistas (solo administradores) — RNF "el aplicativo mantendrá
 * actualizada la base de datos de los especialistas".
 *
 *   - Actualizaciones de la IPS: cada 10 días la IPS manda su lista de
 *     especialistas y agendas (simulada); también se puede pedir ahora.
 *   - Agregar un especialista con su horario semanal (un turno por bloque:
 *     día, sede, modalidad, desde, hasta y duración de cada cita). Los
 *     turnos de un día no se pueden cruzar: nadie está en dos sedes a la vez.
 *   - Cambiar su horario, desactivarlo o activarlo. Las citas ya agendadas
 *     siempre se conservan.
 *   - Las sedes de la red (RF-89), al final: ver SedesDeLaRed.
 *   - Las farmacias donde se reclaman las fórmulas: ver FarmaciasDeLaRed.
 */

const ESTADOS = [
  ["", "Todos"],
  ["activo", "Activos"],
  ["inactivo", "Inactivos"],
];

function turnoNuevo(sedes, usados = []) {
  const dia = [0, 1, 2, 3, 4, 5].find((d) => !usados.includes(d)) ?? 0;
  return {
    dia_semana: dia,
    sede_id: sedes[0]?.id ?? "",
    modalidad: "presencial",
    hora_inicio: "07:00",
    hora_fin: "12:00",
    duracion_minutos: 20,
  };
}

// Lo que llega del backend ("07:00:00") a lo que usa el campo de hora ("07:00").
const paraEditar = (turnos) =>
  turnos.map((t) => ({ ...t, hora_inicio: t.hora_inicio.slice(0, 5), hora_fin: t.hora_fin.slice(0, 5) }));

/** El horario semanal como tabla editable: una fila por turno. */
function EditorTurnos({ turnos, sedes, onCambiar }) {
  const cambiar = (i, campo, valor) =>
    onCambiar(turnos.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));

  return (
    <div className="editor-turnos">
      <div className="tabla-contenedor">
        <table className="tabla tabla-turnos">
          <thead>
            <tr>
              <th>Día</th>
              <th>Sede</th>
              <th>Modalidad</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Cada cita</th>
              <th>
                <span className="sr-only">Quitar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t, i) => {
              const n = i + 1;
              return (
                <tr key={i}>
                  <td>
                    <select
                      aria-label={`Día del turno ${n}`}
                      value={t.dia_semana}
                      onChange={(e) => cambiar(i, "dia_semana", Number(e.target.value))}
                    >
                      {DIAS.map((dia, valor) => (
                        <option key={dia} value={valor}>
                          {dia}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Sede del turno ${n}`}
                      value={t.sede_id}
                      onChange={(e) => cambiar(i, "sede_id", e.target.value)}
                    >
                      {sedes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Modalidad del turno ${n}`}
                      value={t.modalidad}
                      onChange={(e) => cambiar(i, "modalidad", e.target.value)}
                    >
                      <option value="presencial">Presencial</option>
                      <option value="virtual">Virtual</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="time"
                      aria-label={`Hora de inicio del turno ${n}`}
                      value={t.hora_inicio}
                      onChange={(e) => cambiar(i, "hora_inicio", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      aria-label={`Hora de fin del turno ${n}`}
                      value={t.hora_fin}
                      onChange={(e) => cambiar(i, "hora_fin", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Duración de cada cita del turno ${n}`}
                      value={t.duracion_minutos}
                      onChange={(e) => cambiar(i, "duracion_minutos", Number(e.target.value))}
                    >
                      {DURACIONES.map((d) => (
                        <option key={d} value={d}>
                          {d} min
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <BotonIcono
                      nombre={`Quitar el turno ${n}`}
                      peligro
                      disabled={turnos.length === 1}
                      onClick={() => onCambiar(turnos.filter((_, j) => j !== i))}
                    >
                      <IconoQuitar />
                    </BotonIcono>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn btn--outline btn--compacto editor-turnos__agregar"
        onClick={() => onCambiar([...turnos, turnoNuevo(sedes, turnos.map((t) => t.dia_semana))])}
      >
        Agregar turno
      </button>
    </div>
  );
}

function FormularioEspecialista({ especialidades, sedes, ocupado, onGuardar, onVolver }) {
  const [datos, setDatos] = useState({
    tratamiento: "Dr.",
    nombre: "",
    especialidad_id: especialidades[0]?.id ?? "",
    registro_medico: "",
    turnos: [turnoNuevo(sedes)],
  });
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });

  return (
    <form
      className="card formulario-admin"
      aria-labelledby="titulo-nuevo-especialista"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ ...datos, registro_medico: datos.registro_medico.trim() || null });
      }}
    >
      <CabezaTarjeta id="titulo-nuevo-especialista" titulo="Nuevo especialista" dato="Su agenda se genera de inmediato" />
      <div className="campos-admin campos-especialista">
        <div className="field">
          <label htmlFor="tratamiento">Tratamiento</label>
          <select id="tratamiento" value={datos.tratamiento} onChange={cambiar("tratamiento")}>
            <option value="Dr.">Dr.</option>
            <option value="Dra.">Dra.</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="nombre-especialista">Nombre completo</label>
          <input
            id="nombre-especialista"
            value={datos.nombre}
            placeholder="Ej. Paula Andrea Restrepo"
            onChange={cambiar("nombre")}
            required
            minLength={3}
          />
        </div>
        <div className="field">
          <label htmlFor="especialidad-especialista">Especialidad</label>
          <select id="especialidad-especialista" value={datos.especialidad_id} onChange={cambiar("especialidad_id")}>
            {especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="registro-medico">Registro médico <span className="opcional">(opcional)</span></label>
          <input
            id="registro-medico"
            value={datos.registro_medico}
            placeholder="Ej. 05-123456"
            maxLength={20}
            onChange={cambiar("registro_medico")}
          />
        </div>
      </div>
      <p className="editor-turnos__titulo">Horario semanal</p>
      <EditorTurnos turnos={datos.turnos} sedes={sedes} onCambiar={(turnos) => setDatos({ ...datos, turnos })} />
      <div className="acciones-admin">
        <button className="btn btn--primary" type="submit" disabled={ocupado}>
          Guardar especialista
        </button>
        <button className="btn btn--outline btn--texto-peligro" type="button" onClick={onVolver}>
          No, volver
        </button>
      </div>
    </form>
  );
}

function PanelHorario({ especialista, sedes, ocupado, onGuardar, onVolver }) {
  const [turnos, setTurnos] = useState(paraEditar(especialista.turnos));
  return (
    <section className="card formulario-admin" aria-labelledby="titulo-horario">
      <CabezaTarjeta id="titulo-horario" titulo={`Horario de ${especialista.nombre}`} dato={especialista.especialidad} />
      <p className="info-admin">
        Los horarios libres se rehacen con el horario nuevo. Las citas ya agendadas se conservan.
      </p>
      <EditorTurnos turnos={turnos} sedes={sedes} onCambiar={setTurnos} />
      <div className="acciones-admin">
        <button className="btn btn--primary" disabled={ocupado} onClick={() => onGuardar(turnos)}>
          Guardar horario
        </button>
        <button className="btn btn--outline btn--texto-peligro" onClick={onVolver}>
          No, volver
        </button>
      </div>
    </section>
  );
}

function Sincronizaciones({ sincronizaciones, proxima, cada }) {
  return (
    <section className="card" aria-labelledby="titulo-ips">
      <CabezaTarjeta
        id="titulo-ips"
        titulo="Actualizaciones de la IPS"
        dato={`Cada ${cada} días · próxima automática: ${formatearSoloFecha(proxima)}`}
      />
      <ul className="sincronizaciones">
        {sincronizaciones.slice(0, 5).map((s) => (
          <li key={s.id}>
            <span className="celda-doble">
              <strong>{formatearFechaHora(s.fecha)}</strong>
              <span className="celda-doble__dato">{origenSincronizacion(s)}</span>
            </span>
            <span className="celda-doble">
              <span>
                {s.especialistas_nuevos} {s.especialistas_nuevos === 1 ? "nuevo" : "nuevos"} ·{" "}
                {s.especialistas_retirados} {s.especialistas_retirados === 1 ? "retirado" : "retirados"} ·{" "}
                {s.franjas_creadas} horarios nuevos
              </span>
              {s.detalle && <span className="celda-doble__dato">{s.detalle}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AdminEspecialistasPage() {
  const [datos, setDatos] = useState(null);
  const [especialidades, setEspecialidades] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [panel, setPanel] = useState(null); // { tipo: "nuevo" | "horario" | "estado", especialista }
  const [estado, setEstado] = useState("activo");
  const [texto, setTexto] = useState("");

  const cargar = useCallback(
    () =>
      listarEspecialistasAdmin()
        .then((d) => {
          setDatos(d);
          setError("");
        })
        .catch((err) => setError(err.message)),
    []
  );

  // Las sedes abiertas: las que se pueden usar en un horario.
  const cargarSedes = useCallback(
    () =>
      listarSedes()
        .then(setSedes)
        .catch((err) => setError(err.message)),
    []
  );

  useEffect(() => {
    cargar();
    cargarSedes();
    listarEspecialidades()
      .then(setEspecialidades)
      .catch((err) => setError(err.message));
  }, [cargar, cargarSedes]);

  async function ejecutar(accion, mensaje) {
    setOcupado(true);
    setAviso("");
    setError("");
    try {
      const resultado = await accion();
      setAviso(mensaje(resultado));
      setPanel(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  function abrir(tipo, especialista = null) {
    setAviso("");
    setError("");
    setPanel({ tipo, especialista });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const todos = useMemo(() => datos?.especialistas ?? [], [datos]);
  const visibles = useMemo(() => {
    const buscado = texto.trim().toLowerCase();
    return todos.filter(
      (e) =>
        (!estado || e.activo === (estado === "activo")) &&
        (!buscado ||
          [e.nombre, e.especialidad, e.registro_medico]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(buscado)))
    );
  }, [todos, estado, texto]);
  const cuantos = (valor) => todos.filter((e) => !valor || e.activo === (valor === "activo")).length;

  return (
    <>
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Especialistas</h1>
          <p className="admin-subtitulo">
            Médicos de la red, su horario semanal y su agenda de los próximos 10 días hábiles. La IPS envía su
            actualización cada 10 días; también puede cargarla ahora.
          </p>
        </div>
        <div className="acciones-admin">
          <button
            type="button"
            className="btn btn--outline"
            disabled={ocupado || !sedes.length}
            onClick={() => abrir("nuevo")}
          >
            Agregar especialista
          </button>
          <div className="accion-con-nota">
            <button
              type="button"
              className="btn btn--primary"
              disabled={ocupado}
              aria-describedby="nota-ips"
              onClick={() =>
                ejecutar(
                  () => sincronizarIps(),
                  (s) => `La IPS envió su actualización. ${s.detalle} Se generaron ${s.franjas_creadas} horarios nuevos.`
                )
              }
            >
              {ocupado ? "Cargando…" : "Cargar actualizaciones de la IPS"}
            </button>
            {/* En el proyecto la IPS no está conectada: la actualización es simulada (ips_simulada_service). */}
            <span id="nota-ips" className="accion-con-nota__nota">
              Simulación de la actualización que envía la IPS
            </span>
          </div>
        </div>
      </div>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {panel?.tipo === "nuevo" && (
        <FormularioEspecialista
          especialidades={especialidades}
          sedes={sedes}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onGuardar={(nuevo) =>
            ejecutar(
              () => crearEspecialista(nuevo),
              (e) => `Se agregó a ${e.nombre}: ya tiene ${e.cupos_libres} horarios libres para agendar.`
            )
          }
        />
      )}
      {panel?.tipo === "horario" && (
        <PanelHorario
          key={panel.especialista.id}
          especialista={panel.especialista}
          sedes={sedes}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onGuardar={(turnos) =>
            ejecutar(
              () => cambiarHorarioEspecialista(panel.especialista.id, turnos),
              (e) => `Horario de ${e.nombre} actualizado: ${e.cupos_libres} horarios libres.`
            )
          }
        />
      )}
      {panel?.tipo === "estado" && (
        <div
          className={`panel-admin panel-admin--confirmar panel-admin--fila ${panel.especialista.activo ? "panel-admin--peligro" : ""}`}
          role="alertdialog"
          aria-labelledby="confirmar-especialista"
        >
          <p id="confirmar-especialista">
            {panel.especialista.activo ? (
              <>
                <strong>¿Desea desactivar a {panel.especialista.nombre}?</strong> Ya no se le darán citas nuevas.{" "}
                {panel.especialista.citas_proximas
                  ? `Sus ${panel.especialista.citas_proximas} citas ya agendadas se conservan.`
                  : "No tiene citas próximas."}
              </>
            ) : (
              <>
                <strong>¿Desea activar a {panel.especialista.nombre}?</strong> Se generará su agenda de los próximos
                10 días hábiles.
              </>
            )}
          </p>
          <div className="acciones-admin">
            <button
              className={`btn ${panel.especialista.activo ? "btn--peligro" : "btn--primary"}`}
              disabled={ocupado}
              autoFocus
              onClick={() =>
                ejecutar(
                  () => cambiarEstadoEspecialista(panel.especialista.id, !panel.especialista.activo),
                  (e) => `${e.nombre} quedó ${e.activo ? "activo" : "inactivo"}.`
                )
              }
            >
              {panel.especialista.activo ? "Sí, desactivar" : "Sí, activar"}
            </button>
            <button className="btn btn--outline btn--texto-peligro" onClick={() => setPanel(null)}>
              No, volver
            </button>
          </div>
        </div>
      )}

      {datos && (
        <Sincronizaciones
          sincronizaciones={datos.sincronizaciones}
          proxima={datos.proxima_automatica}
          cada={datos.dias_entre_actualizaciones}
        />
      )}

      <div className="filtros-admin filtros-admin--especialistas">
        <div className="field">
          <label htmlFor="buscar-especialista">Buscar</label>
          <div className="campo-con-icono">
            <IconoBuscar />
            <input
              id="buscar-especialista"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej. nombre, especialidad o registro"
            />
          </div>
        </div>
      </div>

      <div className="chips-estado" role="group" aria-label="Filtrar por estado">
        {ESTADOS.map(([valor, nombre]) => (
          <button
            key={valor || "todos"}
            type="button"
            className={`chip-estado ${estado === valor ? "is-activo" : ""}`}
            aria-pressed={estado === valor}
            onClick={() => setEstado(valor)}
          >
            {nombre} <span className="chip-estado__conteo">{cuantos(valor)}</span>
          </button>
        ))}
      </div>

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Especialista</th>
              <th>Especialidad</th>
              <th>Horario semanal</th>
              <th>Agenda</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => (
              <tr key={e.id}>
                <td>
                  <span className="celda-persona">
                    <FotoProfesional nombre={e.nombre} tamano={32} />
                    <span className="celda-persona__textos">
                      <span className="celda-persona__nombre">{e.nombre}</span>
                      <span className="celda-persona__dato">
                        {e.registro_medico ? `Registro ${e.registro_medico} · ` : ""}
                        {ORIGEN_ESPECIALISTA[e.origen] ?? e.origen}
                      </span>
                    </span>
                  </span>
                </td>
                <td>{e.especialidad}</td>
                <td>
                  <ul className="horario-resumen">
                    {resumenHorario(e.turnos).map((linea) => (
                      <li key={linea}>{linea}</li>
                    ))}
                  </ul>
                </td>
                <td>
                  <span className="celda-doble">
                    <span>{e.cupos_libres} horarios libres</span>
                    <span className="celda-doble__dato">
                      {e.citas_proximas} {e.citas_proximas === 1 ? "cita próxima" : "citas próximas"}
                    </span>
                  </span>
                </td>
                <td>
                  <span className={`badge ${e.activo ? "badge--success" : "badge--neutral"}`}>
                    {e.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>
                  <div className="acciones-tabla">
                    <BotonIcono
                      nombre={`Cambiar el horario de ${e.nombre}`}
                      disabled={ocupado}
                      onClick={() => abrir("horario", e)}
                    >
                      <IconoEditar />
                    </BotonIcono>
                    <button
                      type="button"
                      className={`btn btn--compacto ${e.activo ? "btn--peligro-outline" : "btn--outline"}`}
                      disabled={ocupado}
                      aria-label={`${e.activo ? "Desactivar" : "Activar"} a ${e.nombre}`}
                      onClick={() => abrir("estado", e)}
                    >
                      {e.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {datos && visibles.length === 0 && <p className="tabla-vacia">No hay especialistas con esos filtros.</p>}
      </div>

      <SedesDeLaRed
        onCambio={() => {
          cargarSedes();
          cargar();
        }}
      />

      <FarmaciasDeLaRed sedes={sedes} />
    </>
  );
}
