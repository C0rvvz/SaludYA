import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, conFiltros } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import DiasYHoras from "./DiasYHoras";
import EpsMedico from "./EpsMedico";
import FotoProfesional from "./FotoProfesional";
import { Chevron } from "../Iconos";
import { CANALES } from "../../utils/citas";
import { capitalizar, formatearFecha, formatearHora } from "../../utils/formato";
import { agruparPorEspecialista, diaCorto, dondeAtiende } from "../../utils/agendar";
import { despuesDePintar, llevarALaVista } from "../../utils/desplazamiento";
import { conceptoDelValor, puedeAgendarCon, relacionConMedico, valorConMedico } from "../../utils/eps";

const MODALIDADES = [
  { value: "", label: "Todas" },
  { value: "presencial", label: "Presencial" },
  { value: "virtual", label: "Virtual" },
];

const FILTROS_VACIOS = { ciudad: "", modalidad: "", sedeId: "" };

const HORARIO_TOMADO = "Ese horario ya no está disponible: otra persona lo reservó momentos antes. Elija otro.";

const unicasPorId = (lista) => [...new Map(lista.map((x) => [x.id, x])).values()];

/**
 * Paso 2 de "Agendar": médico, día y hora (HU-10 a HU-16).
 *
 * Computador: tres columnas (filtros y médicos · días y horas · resumen
 * "Su cita" con el canal del recordatorio). Si elige un médico de abajo en
 * la lista, la página sube con suavidad hasta sus días y horas. Celular:
 * primero la lista de médicos y, al elegir uno, sus días y horas (`vista` =
 * "medico" | "hora").
 *
 * Los filtros (ciudad, modalidad y sede) se aplican sobre los horarios de
 * la especialidad, sin volver a consultar (HU-11). Al confirmar, el
 * servidor revisa que el horario siga libre (HU-16).
 *
 * Si la especialidad no tiene médicos en la red (`sinMedicos`), se dice así
 * y se ofrece solicitar una petición (la lista de espera necesita sedes).
 *
 * Cada médico lleva su EPS y el valor de la consulta, en tres grupos:
 * los de su EPS y aliadas (copago), los particulares (se pueden agendar,
 * pero cuestan más) y los de otras EPS (en gris, sin poder elegirlos).
 */
export default function PasoHorario({
  especialidadId,
  especialidad,
  sinMedicos = false,
  franjas,
  especialistaInicial,
  vista,
  onVista,
  onCambiarEspecialidad,
  onConfirmar,
  onRecargar,
}) {
  const { paciente } = useAuth();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [especialistaId, setEspecialistaId] = useState(especialistaInicial);
  const [franjaId, setFranjaId] = useState(null);
  const [canal, setCanal] = useState("whatsapp");
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const horasRef = useRef(null);

  // Las ciudades y sedes que se ofrecen son solo aquellas donde la especialidad tiene cupos.
  const sedes = useMemo(() => unicasPorId(franjas.map((f) => f.sede)), [franjas]);
  const ciudades = [...new Set(sedes.map((s) => s.ciudad))].sort();
  const sedesDeLaCiudad = sedes.filter((s) => !filtros.ciudad || s.ciudad === filtros.ciudad);

  const todosLosGrupos = useMemo(
    () =>
      agruparPorEspecialista(
        franjas.filter(
          (f) =>
            (!filtros.ciudad || f.sede.ciudad === filtros.ciudad) &&
            (!filtros.modalidad || f.modalidad === filtros.modalidad) &&
            (!filtros.sedeId || f.sede.id === filtros.sedeId)
        )
      ),
    [franjas, filtros]
  );
  // Su EPS y aliadas (copago), los particulares (cuestan más) y los de otras EPS (no se eligen).
  const relacion = (g) => relacionConMedico(paciente, g.especialista);
  const cubiertos = todosLosGrupos.filter((g) => ["propia", "aliada", "libre"].includes(relacion(g)));
  const particulares = todosLosGrupos.filter((g) => relacion(g) === "particular");
  const deOtrasEps = todosLosGrupos.filter((g) => relacion(g) === "otra");
  const grupos = [...cubiertos, ...particulares];
  const hayAgendables = franjas.some((f) => puedeAgendarCon(paciente, f.especialista));

  // Lo elegido se deriva de lo que hay: si un filtro deja por fuera al médico
  // o la hora, se pasa al primero disponible en vez de quedar en blanco.
  const grupo = grupos.find((g) => g.especialista.id === especialistaId) ?? grupos[0] ?? null;
  const franja = grupo?.franjas.find((f) => f.id === franjaId) ?? null;

  function cambiarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor, ...(campo === "ciudad" ? { sedeId: "" } : {}) }));
    setError("");
  }

  function elegirMedico(id) {
    setEspecialistaId(id);
    setFranjaId(null);
    setError("");
    // En el celular sus horas están en otra vista ("Ver su disponibilidad"), que ya empieza arriba.
    if (!window.matchMedia?.("(max-width: 1099px)").matches) despuesDePintar(() => llevarALaVista(horasRef.current));
  }

  async function confirmar() {
    setConfirmando(true);
    setError("");
    try {
      await onConfirmar(franja, canal);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(HORARIO_TOMADO);
        setFranjaId(null);
        onRecargar();
      } else {
        setError(err.message);
      }
    } finally {
      setConfirmando(false);
    }
  }

  // Una tarjeta de médico que se puede elegir, con su EPS y el valor de la consulta.
  function tarjetaMedico(g) {
    const elegido = g.especialista.id === grupo?.especialista.id;
    return (
      <button
        key={g.especialista.id}
        type="button"
        className={`tarjeta-medico tarjeta-medico--${relacion(g)} ${elegido ? "is-elegida" : ""}`}
        aria-pressed={elegido}
        onClick={() => elegirMedico(g.especialista.id)}
      >
        <FotoProfesional nombre={g.especialista.nombre} />
        <span className="tarjeta-medico__textos">
          <span className="tarjeta-medico__nombre">
            {g.especialista.nombre} <EpsMedico especialista={g.especialista} paciente={paciente} />
          </span>
          <span className="tarjeta-medico__donde">{dondeAtiende(g.franjas)}</span>
          <span className="tarjeta-medico__proximo">
            Próximo: {diaCorto(g.franjas[0].fecha)} · {formatearHora(g.franjas[0].hora)}
          </span>
        </span>
        <span className="tarjeta-medico__lado">
          {valorConMedico(paciente, g.especialista) && (
            <span className="tarjeta-medico__valor">{valorConMedico(paciente, g.especialista)}</span>
          )}
          {elegido && (
            <span className="tarjeta-medico__check" aria-hidden="true">
              ✓
            </span>
          )}
        </span>
      </button>
    );
  }

  const enlaceEspera = conFiltros("/lista-espera", { especialidad: especialidadId });
  const enlaceCarta = conFiltros("/solicitudes", { tipo: "formal", especialidad: especialidadId });

  const encabezado = (
    <div className="agendar-encabezado">
      <div>
        <p className="rotulo rotulo--marca">{especialidad}</p>
        <h1>
          <span className="solo-computador">Elija médico, día y hora</span>
          <span className="solo-movil">{vista === "hora" ? "Elija día y hora" : "Elija su médico"}</span>
        </h1>
      </div>
      <button type="button" className="btn-volver solo-computador" onClick={onCambiarEspecialidad}>
        <span className="btn__circulo">
          <Chevron hacia="izquierda" />
        </span>
        Cambiar especialidad
      </button>
    </div>
  );

  if (sinMedicos) {
    return (
      <>
        {encabezado}
        <section className="card agendar-sin-cupos">
          <h2>Por el momento no hay médicos de {especialidad} en SaludYA</h2>
          <p>
            Cuando se vincule un especialista, podrá agendar aquí. Mientras tanto, puede solicitar una petición:
            revisaremos su caso y le ayudaremos a conseguir la cita.
          </p>
          <div className="acciones-admin">
            <Link className="btn btn--primary" to={enlaceCarta}>
              Solicitar petición
            </Link>
            <button type="button" className="btn btn--outline" onClick={onCambiarEspecialidad}>
              Elegir otra especialidad
            </button>
          </div>
        </section>
      </>
    );
  }

  if (!hayAgendables) {
    return (
      <>
        {encabezado}
        <section className="card agendar-sin-cupos">
          <h2>
            Por ahora no hay horarios libres{especialidad ? ` de ${especialidad}` : ""}
            {franjas.length > 0 && " con médicos de su EPS"}
          </h2>
          <p>Podemos avisarle apenas se libere un cupo. También puede solicitar una petición para pedir una cita en otra fecha.</p>
          <div className="acciones-admin">
            <Link className="btn btn--primary" to={enlaceEspera}>
              Avisarme cuando haya cupo
            </Link>
            <Link className="btn btn--outline" to={enlaceCarta}>
              Solicitar petición
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {encabezado}

      <div className="agendar-horario" data-vista={vista}>
        <div className="agendar-medicos">
          <div className="card filtros-agendar">
            <div className="filtros-agendar__selects">
              <div className="field">
                <label htmlFor="filtro-ciudad">Ciudad</label>
                <select id="filtro-ciudad" value={filtros.ciudad} onChange={(e) => cambiarFiltro("ciudad", e.target.value)}>
                  <option value="">Todas</option>
                  {ciudades.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="filtro-modalidad">Modalidad</label>
                <select
                  id="filtro-modalidad"
                  value={filtros.modalidad}
                  onChange={(e) => cambiarFiltro("modalidad", e.target.value)}
                >
                  {MODALIDADES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="filtros-agendar__rotulo" id="filtro-sede">
              Sede
            </p>
            <div className="chips-sede" role="group" aria-labelledby="filtro-sede">
              {[{ id: "", nombre: "Todas" }, ...sedesDeLaCiudad].map((s) => (
                <button
                  key={s.id || "todas"}
                  type="button"
                  className={`chip-sede ${filtros.sedeId === s.id ? "is-elegida" : ""}`}
                  aria-pressed={filtros.sedeId === s.id}
                  onClick={() => cambiarFiltro("sedeId", s.id)}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          </div>

          {grupos.length === 0 ? (
            <div className="agendar-vacio agendar-vacio--caja">
              <p>Ningún médico tiene cupo con estos filtros.</p>
              <button type="button" className="btn btn--outline btn--compacto" onClick={() => setFiltros(FILTROS_VACIOS)}>
                Quitar los filtros
              </button>
            </div>
          ) : (
            <>
              {cubiertos.length > 0 && (
                <div className="agendar-medicos__grupo">
                  <div className="agendar-medicos__titulo">
                    <p className="rotulo">{paciente?.eps_id ? "Médicos de su EPS y EPS aliadas" : "Médicos con cupo"}</p>
                    <span>Del cupo más cercano al más lejano</span>
                  </div>
                  <div className="agendar-medicos__lista">{cubiertos.map(tarjetaMedico)}</div>
                </div>
              )}
              {particulares.length > 0 && (
                <div className="agendar-medicos__grupo">
                  <p className="rotulo">Particulares</p>
                  <p className="aviso-particular">
                    {paciente?.eps_id ? (
                      <>
                        Su EPS no cubre estas consultas. Puede agendarlas, pero <strong>cuestan más</strong>.
                      </>
                    ) : (
                      <>
                        Como no tiene EPS, sus consultas son <strong>particulares</strong>.
                      </>
                    )}
                  </p>
                  <div className="agendar-medicos__lista">{particulares.map(tarjetaMedico)}</div>
                </div>
              )}
            </>
          )}

          {deOtrasEps.length > 0 && (
            <div className="agendar-medicos__otras">
              <p className="rotulo">De otras EPS (no disponibles)</p>
              <div className="agendar-medicos__lista">
                {deOtrasEps.map((g) => (
                  <button key={g.especialista.id} type="button" className="tarjeta-medico tarjeta-medico--otra-eps" disabled>
                    <FotoProfesional nombre={g.especialista.nombre} />
                    <span className="tarjeta-medico__textos">
                      <span className="tarjeta-medico__nombre">
                        {g.especialista.nombre} <EpsMedico especialista={g.especialista} paciente={paciente} />
                      </span>
                      <span className="tarjeta-medico__donde">{dondeAtiende(g.franjas)}</span>
                      <span className="tarjeta-medico__proximo">No disponible con su EPS</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {grupo && (
            <button type="button" className="btn btn--primary btn--bloque solo-movil" onClick={() => onVista("hora")}>
              Ver su disponibilidad
            </button>
          )}
        </div>

        <section ref={horasRef} className="card agendar-horas llevar-a-la-vista" aria-labelledby="titulo-horas">
          {grupo ? (
            <>
              <div className="agendar-horas__medico solo-movil">
                <FotoProfesional nombre={grupo.especialista.nombre} tamano={46} />
                <div>
                  <p className="tarjeta-medico__nombre">{grupo.especialista.nombre}</p>
                  <p className="tarjeta-medico__donde">{dondeAtiende(grupo.franjas)}</p>
                </div>
              </div>
              <DiasYHoras
                key={grupo.especialista.id}
                franjas={grupo.franjas}
                elegidaId={franja?.id}
                onElegir={(f) => {
                  setFranjaId(f?.id ?? null);
                  setError("");
                }}
                titulo="Elija la hora"
                tituloId="titulo-horas"
              />
            </>
          ) : (
            <p className="agendar-vacio" id="titulo-horas">
              Elija un médico para ver sus horarios.
            </p>
          )}
        </section>

        <section className="card resumen-cita" aria-labelledby="titulo-su-cita">
          <p className="rotulo rotulo--marca" id="titulo-su-cita">
            Su cita
          </p>
          {grupo && (
            <div className="resumen-cita__quien">
              <FotoProfesional nombre={grupo.especialista.nombre} tamano={48} />
              <div>
                <p className="tarjeta-medico__nombre">
                  {grupo.especialista.nombre} <EpsMedico especialista={grupo.especialista} paciente={paciente} />
                </p>
                <p className="tarjeta-medico__donde">{especialidad}</p>
              </div>
            </div>
          )}
          <div>
            <div className="summary-row">
              <span className="summary-row__label">Día</span>
              <span className="summary-row__value">{franja ? formatearFecha(franja.fecha) : "—"}</span>
            </div>
            <div className="summary-row">
              <span className="summary-row__label">Hora</span>
              <span className="summary-row__value">{franja ? formatearHora(franja.hora) : "—"}</span>
            </div>
            <div className="summary-row">
              <span className="summary-row__label">Sede</span>
              <span className="summary-row__value">{franja ? `${franja.sede.nombre} · ${franja.sede.ciudad}` : "—"}</span>
            </div>
            <div className="summary-row">
              <span className="summary-row__label">Modalidad</span>
              <span className="summary-row__value">{franja ? capitalizar(franja.modalidad) : "—"}</span>
            </div>
            {grupo && valorConMedico(paciente, grupo.especialista) && (
              <div className="summary-row resumen-cita__valor">
                <span className="summary-row__label">
                  Valor de la consulta
                  <span className="resumen-cita__concepto">
                    {conceptoDelValor(paciente, grupo.especialista)} · lo paga después de la cita
                  </span>
                </span>
                <span className="summary-row__value">{valorConMedico(paciente, grupo.especialista)}</span>
              </div>
            )}
          </div>

          <fieldset className="canales-cita">
            <legend className="obligatorio">¿Por dónde le avisamos?</legend>
            <p className="canales-cita__ayuda">Por ese medio le enviaremos el comprobante y el recordatorio.</p>
            <div className="canales-cita__opciones">
              {Object.entries(CANALES).map(([valor, texto]) => (
                <label key={valor} className="canal-opcion">
                  <input
                    type="radio"
                    name="canal_recordatorio"
                    value={valor}
                    checked={canal === valor}
                    onChange={() => setCanal(valor)}
                  />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            className="btn btn--primary btn--bloque"
            disabled={!franja || confirmando}
            onClick={confirmar}
          >
            {confirmando ? "Agendando su cita…" : "Confirmar cita"}
          </button>
          {!franja && <p className="resumen-cita__falta">Elija una hora para confirmar.</p>}
        </section>

        <p className="agendar-nota">
          ¿Ningún horario le sirve? <Link to={enlaceEspera}>Pida que le avisemos si hay cupo</Link> o{" "}
          <Link to={enlaceCarta}>solicite una petición</Link>.
        </p>
      </div>
    </>
  );
}
