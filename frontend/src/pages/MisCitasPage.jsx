import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AsistenteChat from "../components/AsistenteChat";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import DetalleCita from "../components/citas/DetalleCita";
import HistorialCitas from "../components/citas/HistorialCitas";
import ItemCita from "../components/citas/ItemCita";
import { listarMisCitas } from "../api/citas";
import { ESTADOS_ACTIVOS } from "../utils/citas";

/**
 * "Mis citas" — Bloques 5, 6 y 7: gestionar la cita mientras llega la
 * fecha, el día de la consulta y después.
 *
 * HU-26: apartado "Mis citas", citas organizadas por estado (pestañas)
 *        y detalle al seleccionar una.
 * HU-27: próximas citas con fecha, hora, sede y modalidad, y acciones.
 * HU-29: citas pendientes de confirmar asistencia, con botón directo.
 * HU-28: historial de citas anteriores, por mes y con filtros.
 * HU-30: opciones de cada cita en la lista (reprogramar, cancelar,
 *        agendar de nuevo) y la información actualizada tras cada acción.
 *
 * El detalle y sus acciones (HU-18, HU-20, HU-21, HU-24) están en
 * components/citas/DetalleCita.jsx.
 */

const PESTANAS = [
  {
    id: "por_confirmar",
    titulo: "Por confirmar",
    vacio: "No tiene citas pendientes de confirmar.",
    filtro: (c) => c.estado_visible === "pendiente_confirmar",
  },
  {
    id: "proximas",
    titulo: "Próximas",
    vacio: "No tiene citas próximas.",
    filtro: (c) => ESTADOS_ACTIVOS.includes(c.estado_visible),
  },
  {
    id: "historial",
    titulo: "Historial",
    vacio: "Todavía no tiene citas anteriores, canceladas ni reprogramadas.",
    filtro: (c) => !ESTADOS_ACTIVOS.includes(c.estado_visible),
  },
];

export default function MisCitasPage() {
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState(null);
  const [seleccion, setSeleccion] = useState(null); // { id, aviso, modo }
  const [aviso, setAviso] = useState(null); // { tipo, texto }
  const [procesandoId, setProcesandoId] = useState(null);

  const cargar = useCallback(
    () =>
      listarMisCitas()
        .then((datos) => {
          setCitas(datos);
          setError("");
          // Al entrar, si hay algo por confirmar se muestra primero (HU-29).
          setPestana(
            (actual) =>
              actual ??
              (datos.some((c) => c.estado_visible === "pendiente_confirmar") ? "por_confirmar" : "proximas")
          );
        })
        .catch((err) => setError(err.message))
        .finally(() => setCargando(false)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const conteos = useMemo(
    () => Object.fromEntries(PESTANAS.map((p) => [p.id, citas.filter(p.filtro).length])),
    [citas]
  );
  const actual = PESTANAS.find((p) => p.id === pestana) ?? PESTANAS[1];
  let visibles = citas.filter(actual.filtro);
  if (actual.id === "historial") visibles = [...visibles].reverse(); // HU-28: lo más reciente primero

  // Acciones rápidas desde la lista: confirmar asistencia (HU-29) o
  // registrar la llegada (HU-24), sin tener que abrir el detalle.
  async function accionDesdeLista(cita, accion, texto) {
    setProcesandoId(cita.id);
    setAviso(null);
    try {
      await accion(cita.id);
      setAviso({ tipo: "success", texto });
      await cargar();
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setProcesandoId(null);
    }
  }

  function abrir(cita, modo = "ver") {
    setAviso(null);
    setSeleccion({ id: cita.id, aviso: "", modo });
  }

  function abrirPorNumero(numero, avisoTexto, idConocido) {
    const id = idConocido ?? citas.find((c) => c.numero_comprobante === numero)?.id;
    if (id) setSeleccion({ id, aviso: avisoTexto ?? "", modo: "ver" });
  }

  const renderCita = (c) => (
    <ItemCita
      key={c.id}
      cita={c}
      procesando={procesandoId === c.id}
      onAbrir={(modo) => abrir(c, modo)}
      onAccionRapida={(accion, texto) => accionDesdeLista(c, accion, texto)}
    />
  );

  let contenido;
  if (cargando) {
    contenido = <p>Cargando sus citas...</p>;
  } else if (visibles.length === 0) {
    contenido = (
      <div className="empty-state">
        <p>{actual.vacio}</p>
        <Link to="/panel" className="btn btn--primary">
          Agendar una cita
        </Link>
      </div>
    );
  } else if (actual.id === "historial") {
    contenido = <HistorialCitas citas={visibles} renderCita={renderCita} />;
  } else {
    contenido = <div className="lista-citas">{visibles.map(renderCita)}</div>;
  }

  return (
    <div>
      <EncabezadoPaciente />

      <div className="section mis-citas">
        {seleccion ? (
          <DetalleCita
            key={`${seleccion.id}-${seleccion.modo}`}
            citaId={seleccion.id}
            avisoInicial={seleccion.aviso}
            modoInicial={seleccion.modo}
            onVolver={() => {
              setSeleccion(null);
              cargar();
            }}
            onCambio={cargar}
            onAbrirNumero={abrirPorNumero}
          />
        ) : (
          <>
            <h1 style={{ fontSize: "var(--text-xl)" }}>Mis citas</h1>
            <p>Consulte sus citas, confirme que asistirá, cámbielas o cancélelas.</p>

            {aviso && <div className={`alert alert--${aviso.tipo}`}>{aviso.texto}</div>}
            {error && <div className="alert alert--error">{error}</div>}

            <div className="pestanas-citas" role="tablist" aria-label="Organizar citas por estado">
              {PESTANAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={actual.id === p.id}
                  className={`pestana-cita ${actual.id === p.id ? "is-active" : ""}`}
                  onClick={() => setPestana(p.id)}
                >
                  {p.titulo} <span className="pestana-cita__conteo">{conteos[p.id]}</span>
                </button>
              ))}
            </div>

            {actual.id === "por_confirmar" && visibles.length > 0 && (
              <p className="field__hint">
                Confirme que asistirá: así podemos ofrecer a otra persona los horarios que no se van a usar.
              </p>
            )}

            {contenido}
          </>
        )}
      </div>

      {/* El asistente también puede gestionar las citas: al terminar una acción, la lista se actualiza. */}
      <AsistenteChat onCambioCitas={cargar} />
    </div>
  );
}
