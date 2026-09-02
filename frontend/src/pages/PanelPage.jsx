import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import { listarEspecialidades, listarSedes, buscarDisponibilidad } from "../api/catalogo";
import { confirmarCita } from "../api/citas";
import { ApiError } from "../api/client";
import {
  formatearFecha,
  formatearHora,
  formatearDiaChip,
  capitalizar,
} from "../utils/formato";
import { iniciales, colorAvatar } from "../utils/avatar";

const MODALIDADES = [
  { value: "", label: "Cualquier modalidad" },
  { value: "presencial", label: "Presencial" },
  { value: "virtual", label: "Virtual" },
];

const CANALES = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "Mensaje de texto" },
  { value: "correo", label: "Correo electrónico" },
  { value: "llamada", label: "Llamada" },
];

const FILTROS_VACIOS = {
  especialidad_id: "",
  ciudad: "",
  sede_id: "",
  modalidad: "",
  fecha: "",
  hora: "",
};

function agruparPorEspecialista(franjas) {
  const mapa = new Map();
  for (const franja of franjas) {
    const id = franja.especialista.id;
    if (!mapa.has(id)) {
      mapa.set(id, { especialista: franja.especialista, franjas: [] });
    }
    mapa.get(id).franjas.push(franja);
  }
  // Las franjas ya vienen ordenadas por fecha/hora desde el backend,
  // así que franjas[0] de cada grupo es la "próxima disponible".
  return Array.from(mapa.values());
}

function agruparPorDia(franjas) {
  const mapa = new Map();
  for (const franja of franjas) {
    if (!mapa.has(franja.fecha)) mapa.set(franja.fecha, []);
    mapa.get(franja.fecha).push(franja);
  }
  return mapa;
}

export default function PanelPage() {
  const { paciente, cerrarSesion } = useAuth();

  const [paso, setPaso] = useState("buscar"); // buscar | horarios | confirmar | comprobante

  const [especialidades, setEspecialidades] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const [yaConsulto, setYaConsulto] = useState(false);

  const [especialistaSeleccionado, setEspecialistaSeleccionado] = useState(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [franjaSeleccionada, setFranjaSeleccionada] = useState(null);

  const [canalRecordatorio, setCanalRecordatorio] = useState("whatsapp");
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmacion, setErrorConfirmacion] = useState("");
  const [citaConfirmada, setCitaConfirmada] = useState(null);

  useEffect(() => {
    listarEspecialidades().then(setEspecialidades).catch(() => {});
    listarSedes().then(setSedes).catch(() => {});
    ejecutarBusqueda(FILTROS_VACIOS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grupos = useMemo(() => agruparPorEspecialista(resultados), [resultados]);
  const diasDelEspecialista = useMemo(
    () => (especialistaSeleccionado ? agruparPorDia(especialistaSeleccionado.franjas) : new Map()),
    [especialistaSeleccionado]
  );
  const horariosDelDia = diaSeleccionado ? diasDelEspecialista.get(diaSeleccionado) ?? [] : [];

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  }

  async function ejecutarBusqueda(filtrosAUsar) {
    setBuscando(true);
    setErrorBusqueda("");
    try {
      const resp = await buscarDisponibilidad(filtrosAUsar);
      setResultados(resp);
      setYaConsulto(true);
    } catch (err) {
      setErrorBusqueda(err.message);
    } finally {
      setBuscando(false);
    }
  }

  function manejarBusqueda(evento) {
    evento.preventDefault();
    ejecutarBusqueda(filtros);
  }

  function limpiarFiltros() {
    setFiltros(FILTROS_VACIOS);
    ejecutarBusqueda(FILTROS_VACIOS);
  }

  // HU-12: elegir un especialista de la lista agrupada.
  function verDisponibilidad(grupo) {
    setEspecialistaSeleccionado(grupo);
    setDiaSeleccionado(grupo.franjas[0].fecha);
    setFranjaSeleccionada(null);
    setPaso("horarios");
  }

  // HU-13/HU-14/HU-15: la franja elegida ya trae sede, modalidad, fecha y hora juntas.
  function continuarConFranja() {
    if (!franjaSeleccionada) return;
    setErrorConfirmacion("");
    setPaso("confirmar");
  }

  async function confirmar() {
    setConfirmando(true);
    setErrorConfirmacion("");
    try {
      // HU-16: el backend revalida que el horario siga disponible.
      const cita = await confirmarCita(franjaSeleccionada.id, canalRecordatorio);
      setCitaConfirmada(cita);
      setPaso("comprobante");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrorConfirmacion(
          "Ese horario ya no está disponible -- alguien más lo tomó justo antes. Elige otro."
        );
      } else {
        setErrorConfirmacion(err.message);
      }
    } finally {
      setConfirmando(false);
    }
  }

  function volverABusqueda() {
    setEspecialistaSeleccionado(null);
    setFranjaSeleccionada(null);
    setErrorConfirmacion("");
    setPaso("buscar");
    ejecutarBusqueda(filtros);
  }

  function volverAHorarios() {
    setFranjaSeleccionada(null);
    setErrorConfirmacion("");
    setPaso("horarios");
  }

  function agendarOtraCita() {
    setCitaConfirmada(null);
    setEspecialistaSeleccionado(null);
    setFranjaSeleccionada(null);
    setCanalRecordatorio("whatsapp");
    setPaso("buscar");
    ejecutarBusqueda(filtros);
  }

  return (
    <div>
      <header className="site-header">
        <Logo />
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-soft)" }}>
            Hola, {paciente?.nombre?.split(" ")[0]}
          </span>
          <button className="btn btn--outline" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="section">
        {paso === "buscar" && (
          <>
            <h1 style={{ fontSize: "var(--text-xl)" }}>Busca tu especialista</h1>
            <p>Filtra por lo que te quede mejor — todos los campos son opcionales.</p>

            <form className="filters-card" onSubmit={manejarBusqueda}>
              <div className="filters-grid-bar">
                <div className="field">
                <label htmlFor="especialidad_id">Especialidad</label>
                <select
                  id="especialidad_id"
                  value={filtros.especialidad_id}
                  onChange={(e) => actualizarFiltro("especialidad_id", e.target.value)}
                >
                  <option value="">Todas</option>
                  {especialidades.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="ciudad">Ciudad</label>
                <input
                  id="ciudad"
                  type="text"
                  value={filtros.ciudad}
                  onChange={(e) => actualizarFiltro("ciudad", e.target.value)}
                  placeholder="Todas"
                />
              </div>

              <div className="field">
                <label htmlFor="sede_id">Sede</label>
                <select
                  id="sede_id"
                  value={filtros.sede_id}
                  onChange={(e) => actualizarFiltro("sede_id", e.target.value)}
                >
                  <option value="">Todas</option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="modalidad">Modalidad</label>
                <select
                  id="modalidad"
                  value={filtros.modalidad}
                  onChange={(e) => actualizarFiltro("modalidad", e.target.value)}
                >
                  {MODALIDADES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="fecha">Fecha</label>
                <input
                  id="fecha"
                  type="date"
                  value={filtros.fecha}
                  onChange={(e) => actualizarFiltro("fecha", e.target.value)}
                />
              </div>

                <div className="field">
                  <label htmlFor="hora">Horario</label>
                  <input
                    id="hora"
                    type="time"
                    value={filtros.hora}
                    onChange={(e) => actualizarFiltro("hora", e.target.value)}
                  />
                </div>
              </div>

              <div className="filters-card__actions">
                <button className="btn btn--primary" type="submit" disabled={buscando}>
                  {buscando ? "Buscando..." : "Buscar"}
                </button>
                <button type="button" className="btn btn--outline" onClick={limpiarFiltros}>
                  Limpiar
                </button>
              </div>
            </form>

            {errorBusqueda && <div className="alert alert--error">{errorBusqueda}</div>}

            {yaConsulto && !buscando && grupos.length === 0 && !errorBusqueda && (
              <div className="empty-state">
                <p>No encontramos horarios con esos filtros. Prueba ajustándolos.</p>
              </div>
            )}

            <div className="specialist-grid">
              {grupos.map((grupo) => {
                const proxima = grupo.franjas[0];
                return (
                  <div className="specialist-card" key={grupo.especialista.id}>
                    <div className="specialist-card__head">
                      <span
                        className="avatar avatar--lg"
                        style={{ background: colorAvatar(grupo.especialista.nombre) }}
                      >
                        {iniciales(grupo.especialista.nombre)}
                      </span>
                      <div>
                        <h3>{grupo.especialista.nombre}</h3>
                        <p>{grupo.especialista.especialidad.nombre}</p>
                      </div>
                    </div>
                    <div className="specialist-card__meta">
                      <span>
                        Próxima disponible: {formatearFecha(proxima.fecha)}, {formatearHora(proxima.hora)}
                      </span>
                      <span>
                        {proxima.sede.nombre} · {proxima.sede.ciudad}
                      </span>
                    </div>
                    <span className="badge badge--success" style={{ alignSelf: "flex-start" }}>
                      {capitalizar(proxima.modalidad)}
                    </span>
                    <button className="btn btn--primary" onClick={() => verDisponibilidad(grupo)}>
                      Ver disponibilidad
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {paso === "horarios" && especialistaSeleccionado && (
          <>
            <button className="back-link" onClick={volverABusqueda}>
              ← Volver a la búsqueda
            </button>

            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <div className="specialist-card__head">
                <span
                  className="avatar avatar--lg"
                  style={{ background: colorAvatar(especialistaSeleccionado.especialista.nombre) }}
                >
                  {iniciales(especialistaSeleccionado.especialista.nombre)}
                </span>
                <div>
                  <h3 style={{ fontSize: "var(--text-md)", marginBottom: "0.15rem" }}>
                    {especialistaSeleccionado.especialista.nombre}
                  </h3>
                  <p style={{ marginBottom: 0, fontSize: "var(--text-sm)" }}>
                    {especialistaSeleccionado.especialista.especialidad.nombre}
                  </p>
                </div>
              </div>
            </div>

            <h2 style={{ fontSize: "var(--text-md)", marginBottom: "0.75rem" }}>Elige un día</h2>
            <div className="day-picker">
              {Array.from(diasDelEspecialista.keys()).map((fecha) => {
                const { dia, numero } = formatearDiaChip(fecha);
                return (
                  <button
                    key={fecha}
                    type="button"
                    className={`day-chip ${diaSeleccionado === fecha ? "is-selected" : ""}`}
                    onClick={() => {
                      setDiaSeleccionado(fecha);
                      setFranjaSeleccionada(null);
                    }}
                  >
                    <span>{dia}</span>
                    <span>{numero}</span>
                  </button>
                );
              })}
            </div>

            <h2 style={{ fontSize: "var(--text-md)", marginBottom: "0.75rem" }}>
              Horarios disponibles
            </h2>
            <div className="time-grid">
              {horariosDelDia.map((franja) => (
                <button
                  key={franja.id}
                  type="button"
                  className={`time-slot ${franjaSeleccionada?.id === franja.id ? "is-selected" : ""}`}
                  onClick={() => setFranjaSeleccionada(franja)}
                >
                  <span className="time-slot__hora">{formatearHora(franja.hora)}</span>
                  <span className="time-slot__meta">
                    {franja.sede.nombre} · {capitalizar(franja.modalidad)}
                  </span>
                </button>
              ))}
            </div>

            <button
              className="btn btn--primary"
              disabled={!franjaSeleccionada}
              onClick={continuarConFranja}
            >
              Continuar
            </button>
          </>
        )}

        {paso === "confirmar" && franjaSeleccionada && (
          <>
            <button className="back-link" onClick={volverAHorarios}>
              ← Volver a horarios
            </button>
            <h1 style={{ fontSize: "var(--text-xl)" }}>Confirma tu cita</h1>

            {errorConfirmacion && (
              <div className="alert alert--error">
                {errorConfirmacion}{" "}
                {errorConfirmacion.includes("ya no está disponible") && (
                  <button className="btn--link" onClick={volverABusqueda}>
                    Volver a buscar
                  </button>
                )}
              </div>
            )}

            <div className="confirm-grid">
              <div className="card">
                <h3>Detalle de la cita</h3>
                <p style={{ fontWeight: 700 }}>{franjaSeleccionada.especialista.nombre}</p>
                <p>{franjaSeleccionada.especialista.especialidad.nombre}</p>
                <p>
                  {formatearFecha(franjaSeleccionada.fecha)} · {formatearHora(franjaSeleccionada.hora)}
                </p>
                <p>{franjaSeleccionada.sede.nombre}</p>
                <p>{capitalizar(franjaSeleccionada.modalidad)}</p>
              </div>

              <div className="card">
                <h3>Datos del paciente</h3>
                <p style={{ fontWeight: 700 }}>{paciente?.nombre}</p>
                <p>CC {paciente?.numero_documento}</p>
                <p>Tel. {paciente?.telefono_whatsapp}</p>
                {paciente?.correo && <p>{paciente.correo}</p>}
              </div>
            </div>

            <p style={{ fontWeight: 700, marginBottom: "0.5rem" }}>
              Canal preferido para recordatorios
            </p>
            <div className="channel-grid">
              {CANALES.map((c) => (
                <label className="channel-card" key={c.value}>
                  <input
                    type="radio"
                    name="canal_recordatorio"
                    value={c.value}
                    checked={canalRecordatorio === c.value}
                    onChange={(e) => setCanalRecordatorio(e.target.value)}
                  />
                  {c.label}
                </label>
              ))}
            </div>

            <button className="btn btn--success" onClick={confirmar} disabled={confirmando}>
              {confirmando ? "Confirmando..." : "Confirmar cita"}
            </button>
          </>
        )}

        {paso === "comprobante" && citaConfirmada && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div style={{ maxWidth: 480, width: "100%" }}>
              <p className="auth-card__eyebrow">Cita confirmada</p>
              <h1 style={{ fontSize: "var(--text-xl)" }}>¡Listo, tu cita quedó agendada!</h1>
              <p className="auth-card__lead">{citaConfirmada.mensaje}</p>

              <div className="card" style={{ textAlign: "left" }}>
                <div className="comprobante-header">
                  <span className="badge badge--success">Confirmada</span>
                  <span className="comprobante-numero">{citaConfirmada.numero_comprobante}</span>
                </div>

              <div className="summary-row">
                <span className="summary-row__label">Especialista</span>
                <span className="summary-row__value">{citaConfirmada.especialista.nombre}</span>
              </div>
              <div className="summary-row">
                <span className="summary-row__label">Especialidad</span>
                <span className="summary-row__value">
                  {citaConfirmada.especialista.especialidad.nombre}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-row__label">Sede</span>
                <span className="summary-row__value">
                  {citaConfirmada.sede.nombre} — {citaConfirmada.sede.ciudad}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-row__label">Modalidad</span>
                <span className="summary-row__value">{capitalizar(citaConfirmada.modalidad)}</span>
              </div>
              <div className="summary-row">
                <span className="summary-row__label">Fecha y hora</span>
                <span className="summary-row__value">
                  {formatearFecha(citaConfirmada.fecha)}, {formatearHora(citaConfirmada.hora)}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-row__label">Recordatorio por</span>
                <span className="summary-row__value">
                  {capitalizar(citaConfirmada.canal_recordatorio)}
                </span>
              </div>
            </div>

            <p className="field__hint" style={{ marginTop: "0.75rem" }}>
              Guarda el número de comprobante — puedes necesitarlo después.
            </p>

            <button
              className="btn btn--primary"
              onClick={agendarOtraCita}
              style={{ marginTop: "1rem" }}
            >
              Agendar otra cita
            </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
