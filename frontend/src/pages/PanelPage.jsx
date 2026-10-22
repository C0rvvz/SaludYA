import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EncabezadoPaciente from "../components/EncabezadoPaciente";
import CitaAgendada from "../components/agendar/CitaAgendada";
import PasoEspecialidad from "../components/agendar/PasoEspecialidad";
import PasoHorario from "../components/agendar/PasoHorario";
import PasosAgendar from "../components/agendar/PasosAgendar";
import { buscarDisponibilidad, listarEspecialidades } from "../api/catalogo";
import { confirmarCita } from "../api/citas";
import { abrirEli } from "../utils/eli";
import "../styles/agendar.css";

/**
 * "Agendar" en 3 pasos: 1) especialidad, 2) médico, día y hora, y
 * 3) la cita agendada con su comprobante (HU-09 a HU-17).
 *
 * "Agendar de nuevo" desde "Mis citas" (HU-30) llega con ?especialidad=
 * y entra directo al paso 2.
 */
export default function PanelPage() {
  const [parametros] = useSearchParams();
  const especialidadInicial = parametros.get("especialidad") ?? "";

  const [paso, setPaso] = useState(especialidadInicial ? 2 : 1);
  const [vista, setVista] = useState("medico"); // paso 2 en el celular: "medico" | "hora"

  const [especialidades, setEspecialidades] = useState([]);
  const [errorEspecialidades, setErrorEspecialidades] = useState("");
  const [todas, setTodas] = useState([]); // horarios libres de todas las especialidades (paso 1)
  const [errorTodas, setErrorTodas] = useState("");

  const [especialidadId, setEspecialidadId] = useState(especialidadInicial);
  const [especialistaInicial, setEspecialistaInicial] = useState(null);
  const [franjas, setFranjas] = useState([]); // horarios libres de la especialidad elegida
  const [cargando, setCargando] = useState(Boolean(especialidadInicial));
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const [cita, setCita] = useState(null);

  const cargarTodas = useCallback(() => {
    setErrorTodas("");
    buscarDisponibilidad()
      .then(setTodas)
      .catch((err) => setErrorTodas(err.message));
  }, []);

  // `enSilencio`: refresca los horarios sin desmontar el paso 2 (p. ej. tras
  // un 409), para que la persona siga viendo el aviso de lo que pasó.
  const cargarHorarios = useCallback(async (id, { enSilencio = false } = {}) => {
    if (!enSilencio) {
      setCargando(true);
      setErrorBusqueda("");
    }
    try {
      setFranjas(await buscarDisponibilidad({ especialidad_id: id }));
    } catch (err) {
      if (!enSilencio) {
        setFranjas([]);
        setErrorBusqueda(err.message);
      }
    } finally {
      if (!enSilencio) setCargando(false);
    }
  }, []);

  useEffect(() => {
    listarEspecialidades()
      .then(setEspecialidades)
      .catch((err) => setErrorEspecialidades(err.message));
    cargarTodas();
    if (especialidadInicial) cargarHorarios(especialidadInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [paso, vista]);

  function irAlPaso2(id, especialistaId = null) {
    setEspecialidadId(id);
    setEspecialistaInicial(especialistaId);
    setVista(especialistaId ? "hora" : "medico");
    setFranjas([]);
    setPaso(2);
    cargarHorarios(id);
  }

  function volverAlPaso1() {
    setPaso(1);
    setVista("medico");
    cargarTodas();
  }

  async function confirmar(franja, canal) {
    // HU-16: el servidor revalida que el horario siga libre (409 si no).
    setCita(await confirmarCita(franja.id, canal));
    setPaso(3);
  }

  function agendarOtra() {
    setCita(null);
    volverAlPaso1();
  }

  const nombreEspecialidad =
    especialidades.find((e) => e.id === especialidadId)?.nombre ?? franjas[0]?.especialista.especialidad.nombre ?? "";

  // "Atrás" del celular: de las horas a los médicos, y de los médicos a las especialidades.
  let atras = null;
  if (paso === 2) atras = vista === "hora" ? () => setVista("medico") : volverAlPaso1;

  return (
    <div>
      <EncabezadoPaciente />

      <div className="section agendar">
        <PasosAgendar actual={paso} onAtras={atras} />

        {errorEspecialidades && paso === 1 && (
          <div className="alert alert--error">No pudimos cargar la lista de especialidades: {errorEspecialidades}</div>
        )}
        {errorTodas && paso === 1 && (
          <div className="alert alert--error">No pudimos ver los cupos de cada especialidad: {errorTodas}</div>
        )}

        {paso === 1 && (
          <PasoEspecialidad
            especialidades={especialidades}
            franjas={todas}
            elegida={especialidadId}
            onElegir={setEspecialidadId}
            onContinuar={irAlPaso2}
            onPreguntarEli={abrirEli}
          />
        )}

        {paso === 2 && cargando && <p className="agendar-cargando">Buscando los horarios libres…</p>}

        {paso === 2 && !cargando && errorBusqueda && (
          <div className="alert alert--error" role="alert">
            {errorBusqueda}{" "}
            <button type="button" className="btn--link" onClick={() => cargarHorarios(especialidadId)}>
              Intentar de nuevo
            </button>
          </div>
        )}

        {paso === 2 && !cargando && !errorBusqueda && (
          <PasoHorario
            key={especialidadId}
            especialidadId={especialidadId}
            especialidad={nombreEspecialidad}
            franjas={franjas}
            especialistaInicial={especialistaInicial}
            vista={vista}
            onVista={setVista}
            onCambiarEspecialidad={volverAlPaso1}
            onConfirmar={confirmar}
            onRecargar={() => cargarHorarios(especialidadId, { enSilencio: true })}
          />
        )}

        {paso === 3 && cita && <CitaAgendada cita={cita} onAgendarOtra={agendarOtra} />}
      </div>
    </div>
  );
}
