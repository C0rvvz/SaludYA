import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import DetalleCita from "../components/citas/DetalleCita";
import HistorialCitas from "../components/citas/HistorialCitas";
import ProximaCita from "../components/citas/ProximaCita";
import ReprogramarCita from "../components/citas/ReprogramarCita";
import TarjetaCita from "../components/citas/TarjetaCita";
import VentanaCalificar from "../components/citas/VentanaCalificar";
import VentanaCancelar from "../components/citas/VentanaCancelar";
import {
  calificarCita,
  cancelarCita,
  confirmarAsistencia,
  listarMisCitas,
  registrarLlegada,
  reprogramarCita,
} from "../api/citas";
import useLlevarALaVista from "../hooks/useLlevarALaVista";
import { ESTADOS_ACTIVOS } from "../utils/citas";
import { despuesDePintar, llevarALaVista, subirAlInicio } from "../utils/desplazamiento";
import { formatearFechaLarga, formatearPesos } from "../utils/formato";
import { conceptoPendiente } from "../utils/pagos";
import "../styles/mis-citas.css";

/**
 * "Mis citas" — Bloques 5, 6 y 7: gestionar la cita mientras llega la
 * fecha, el día de la consulta y después.
 *
 * HU-26: citas organizadas por estado (pestañas) y su detalle al elegir una.
 * HU-27: próximas citas con fecha, hora, sede y modalidad, y acciones.
 * HU-29: citas pendientes de confirmar asistencia, con botón directo.
 * HU-28: historial de citas anteriores, por mes y con filtros.
 * HU-30: opciones de cada cita y la información actualizada tras cada acción.
 * Arriba, las citas atendidas que falta pagar, con "Pagar" (pago en línea).
 *
 * Computador: la lista a la izquierda y el detalle de la cita elegida al
 * lado. Celular: arriba la próxima cita destacada; al tocar una cita, su
 * detalle ocupa la pantalla. Reprogramar es una pantalla propia; cancelar
 * y calificar, ventanas sobre la página.
 *
 * Al ver una cita que está muy abajo en la lista, la página sube con
 * suavidad hasta su detalle; igual con el aviso de cada acción.
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

// La pestaña donde se ve una cita: la actual si la incluye; si no, la que le corresponde.
const pestanaDe = (cita, actual) =>
  (PESTANAS.find((p) => p.id === actual && p.filtro(cita)) ?? [PESTANAS[1], PESTANAS[2]].find((p) => p.filtro(cita)))
    .id;

export default function MisCitasPage() {
  const { paciente } = useAuth();
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState(null);
  const [seleccionId, setSeleccionId] = useState(null);
  const [detalleEnCelular, setDetalleEnCelular] = useState(false);
  const [reprogramando, setReprogramando] = useState(false);
  const [ventana, setVentana] = useState(null); // { tipo: "cancelar" | "calificar", cita }
  const [errorVentana, setErrorVentana] = useState("");
  const [aviso, setAviso] = useState(null); // { tipo, texto }
  const [procesandoId, setProcesandoId] = useState(null);
  const detalleRef = useRef(null);
  const avisoRef = useLlevarALaVista(aviso);

  // `seguir`: después de una acción, se muestra esa cita en la pestaña donde quedó.
  const cargar = useCallback(
    ({ seguir } = {}) =>
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
          const seguida = seguir && datos.find((c) => c.id === seguir);
          if (seguida) {
            setSeleccionId(seguida.id);
            setPestana((actual) => pestanaDe(seguida, actual));
          }
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
  const elegida = visibles.find((c) => c.id === seleccionId) ?? visibles[0] ?? null;
  const proxima = citas.find((c) => ESTADOS_ACTIVOS.includes(c.estado_visible));
  const porPagar = citas.filter((c) => c.pago_pendiente);

  function ver(cita) {
    setSeleccionId(cita.id);
    setDetalleEnCelular(true);
    setAviso(null);
    // En el celular el detalle reemplaza a la lista: se empieza a leer desde arriba. En el
    // computador va al lado de la lista: si quedó arriba, fuera de la vista, se sube hasta él.
    despuesDePintar(() => {
      if (window.matchMedia?.("(max-width: 1099px)").matches) subirAlInicio();
      else llevarALaVista(detalleRef.current);
    });
  }

  function verPorNumero(numero) {
    const cita = citas.find((c) => c.numero_comprobante === numero);
    if (!cita) return;
    setPestana((actualId) => pestanaDe(cita, actualId));
    ver(cita);
  }

  // Confirmar asistencia (HU-29) y "Ya llegué" (HU-24): se hacen de una vez.
  // `seguir`: al llegar, se muestra la cita con el número para recepción.
  async function accionRapida(cita, llamar, texto, { seguir = false } = {}) {
    setProcesandoId(cita.id);
    setAviso(null);
    try {
      await llamar(cita.id);
      setAviso({ tipo: "success", texto });
      await cargar(seguir ? { seguir: cita.id } : undefined);
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setProcesandoId(null);
    }
  }

  function accion(cita, tipo) {
    const especialidad = cita.especialista.especialidad.nombre;
    setAviso(null);
    if (tipo === "confirmar") {
      accionRapida(
        cita,
        confirmarAsistencia,
        `Listo. Confirmó su asistencia a ${especialidad} el ${formatearFechaLarga(cita.fecha).toLowerCase()}.`
      );
    } else if (tipo === "llegada") {
      accionRapida(cita, registrarLlegada, `Listo. Registramos su llegada a ${especialidad}. Espere su turno.`, {
        seguir: true,
      });
    } else if (tipo === "reprogramar") {
      setSeleccionId(cita.id);
      setReprogramando(true);
      despuesDePintar(subirAlInicio);
    } else {
      setErrorVentana("");
      setVentana({ tipo, cita });
    }
  }

  // Cancelar (HU-21) y calificar (HU-71), desde su ventana.
  async function desdeVentana(llamar, texto) {
    const { cita } = ventana;
    setProcesandoId(cita.id);
    setErrorVentana("");
    try {
      await llamar();
      setVentana(null);
      setAviso({ tipo: "success", texto });
      await cargar({ seguir: cita.id });
    } catch (err) {
      setErrorVentana(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  async function reprogramar(cita, franja) {
    const nueva = await reprogramarCita(cita.id, franja.id); // si falla, ReprogramarCita muestra el error
    setReprogramando(false);
    setAviso({
      tipo: "success",
      texto: `Su cita fue reprogramada. Este es su nuevo comprobante: ${nueva.numero_comprobante}.`,
    });
    await cargar({ seguir: nueva.id });
  }

  async function actualizar() {
    setActualizando(true);
    await cargar();
    setActualizando(false);
  }

  const citaAReprogramar = reprogramando && citas.find((c) => c.id === seleccionId);
  if (citaAReprogramar) {
    return (
      <div>
        <EncabezadoPaciente onCambioCitas={cargar} />
        <div className="section mis-citas">
          <ReprogramarCita
            cita={citaAReprogramar}
            onConfirmar={(franja) => reprogramar(citaAReprogramar, franja)}
            onVolver={() => {
              setReprogramando(false);
              despuesDePintar(subirAlInicio);
            }}
          />
        </div>
      </div>
    );
  }

  let lista;
  if (cargando) {
    lista = <p>Cargando sus citas…</p>;
  } else if (visibles.length === 0) {
    lista = (
      <div className="mis-citas__vacio">
        <p>{actual.vacio}</p>
        <Link to="/panel" className="btn btn--primary">
          Agendar una cita
        </Link>
      </div>
    );
  } else {
    const renderCita = (c) => (
      <TarjetaCita
        key={c.id}
        cita={c}
        elegida={c.id === elegida?.id}
        // En el celular, la próxima ya está destacada arriba: no se repite si hay otras.
        ocultaEnMovil={c.id === proxima?.id && visibles.length > 1}
        ocupado={procesandoId === c.id}
        onVer={() => ver(c)}
        onAccion={(tipo) => accion(c, tipo)}
      />
    );
    lista =
      actual.id === "historial" ? (
        <HistorialCitas citas={visibles} renderCita={renderCita} />
      ) : (
        <div className="mis-citas__tarjetas">{visibles.map(renderCita)}</div>
      );
  }

  const primerNombre = paciente?.nombre?.split(" ")[0];

  return (
    <div>
      <EncabezadoPaciente onCambioCitas={cargar} />

      <div className="section mis-citas" data-detalle-en-celular={detalleEnCelular && elegida ? "si" : "no"}>
        <div className="mis-citas__inicio">
          <div className="mis-citas__titulo">
            {primerNombre && <p className="mis-citas__saludo">Hola, {primerNombre}</p>}
            <h1>Mis citas</h1>
            <p className="mis-citas__lead">
              {actual.id === "historial" && citas.some((c) => c.tiene_formula)
                ? "En el historial encuentra lo que le formuló su médico y dónde reclamarlo."
                : "Consulte sus citas, confirme que asistirá, cámbielas o cancélelas."}
            </p>
          </div>

          {porPagar.map((c) => (
            <section key={c.id} className="pago-pendiente" aria-label="Pago pendiente">
              <div className="pago-pendiente__texto">
                <p className="pago-pendiente__titulo">Tiene un pago pendiente: {formatearPesos(c.valor)}</p>
                <p>{conceptoPendiente(c)} Páguelo aquí y evite la fila.</p>
              </div>
              <Link to={`/pagar/${c.id}`} className="btn btn--primary">
                Pagar {formatearPesos(c.valor)}
              </Link>
            </section>
          ))}

          {proxima && (
            <ProximaCita
              cita={proxima}
              ocupado={procesandoId === proxima.id}
              onAccion={(tipo) => accion(proxima, tipo)}
              onVer={() => {
                setPestana((actualId) => pestanaDe(proxima, actualId));
                ver(proxima);
              }}
            />
          )}

          <div className="mis-citas__pestanas" role="tablist" aria-label="Organizar citas por estado" hidden={cargando}>
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={actual.id === p.id}
                className={`pestana-mis-citas ${actual.id === p.id ? "is-active" : ""}`}
                onClick={() => {
                  setPestana(p.id);
                  setAviso(null);
                }}
              >
                {p.titulo} <span className="pestana-mis-citas__conteo">{conteos[p.id]}</span>
              </button>
            ))}
          </div>

          {actual.id === "por_confirmar" && visibles.length > 0 && (
            <p className="mis-citas__ayuda">
              Confirme su asistencia: así podemos ofrecer a otros pacientes los horarios que no se usarán.
            </p>
          )}
        </div>

        {aviso && (
          <div
            ref={avisoRef}
            className={`alert alert--${aviso.tipo} llevar-a-la-vista`}
            role={aviso.tipo === "error" ? "alert" : "status"}
          >
            {aviso.texto}
          </div>
        )}
        {error && <div className="alert alert--error">{error}</div>}

        <div className={`mis-citas__cuerpo ${elegida ? "con-detalle" : ""}`}>
          <div className="mis-citas__lista">{lista}</div>
          {elegida && (
            <div className="mis-citas__detalle llevar-a-la-vista" ref={detalleRef}>
              <DetalleCita
                cita={elegida}
                ocupado={procesandoId === elegida.id}
                actualizando={actualizando}
                onAccion={(tipo) => accion(elegida, tipo)}
                onActualizar={actualizar}
                onAbrirNumero={verPorNumero}
                onVolver={() => {
                  setDetalleEnCelular(false);
                  despuesDePintar(subirAlInicio);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {ventana?.tipo === "cancelar" && (
        <VentanaCancelar
          cita={ventana.cita}
          ocupado={procesandoId === ventana.cita.id}
          error={errorVentana}
          onConfirmar={(motivo) =>
            desdeVentana(
              () => cancelarCita(ventana.cita.id, motivo),
              "Su cita fue cancelada. El horario quedó libre para otro paciente."
            )
          }
          onCerrar={() => setVentana(null)}
        />
      )}
      {ventana?.tipo === "calificar" && (
        <VentanaCalificar
          cita={ventana.cita}
          ocupado={procesandoId === ventana.cita.id}
          error={errorVentana}
          onEnviar={(calificacion, comentario) =>
            desdeVentana(
              () => calificarCita(ventana.cita.id, calificacion, comentario),
              "Gracias por calificar su atención."
            )
          }
          onCerrar={() => setVentana(null)}
        />
      )}
    </div>
  );
}
