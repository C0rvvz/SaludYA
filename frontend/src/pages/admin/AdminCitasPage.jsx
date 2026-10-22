import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import IndicadorRiesgo from "../../components/admin/IndicadorRiesgo";
import {
  BotonIcono,
  IconoBuscar,
  IconoConfirmar,
  IconoInfo,
  IconoLlamar,
  IconoRecordatorio,
} from "../../components/admin/IconosAdmin";
import { EstadoBadge } from "../../components/citas/ElementosCita";
import { confirmarCitaAdmin, enviarRecordatorioAdmin, listarCitasAdmin } from "../../api/admin";
import { listarEspecialidades } from "../../api/catalogo";
import { iniciales } from "../../utils/avatar";
import { CANALES, ESTADO_PERSONAL, GRUPOS_ESTADO } from "../../utils/citas";
import { formatearHora } from "../../utils/formato";

/**
 * Gestión de citas — HU-34 (lista con la información relevante) y HU-43
 * (estado de cada cita y las acciones permitidas según su estado).
 * Los estados se filtran con chips que dicen cuántas citas hay de cada
 * uno. El detalle (HU-35 a HU-42) está en AdminCitaDetallePage.
 */

const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

// "22 oct"
const diaCorto = (fechaIso) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
    .format(new Date(fechaIso.length > 10 ? fechaIso : `${fechaIso}T00:00:00`))
    .replace(".", "")
    .replace(" de ", " ");

export default function AdminCitasPage() {
  const [filtros, setFiltros] = useState(() => ({ buscar: "", desde: hoy(), hasta: "", especialidad_id: "" }));
  const [estado, setEstado] = useState(""); // chip elegido; "" = todas
  const [especialidades, setEspecialidades] = useState([]);
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);

  const cargar = useCallback(
    (f) =>
      listarCitasAdmin(f)
        .then((datos) => {
          setCitas(datos);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setCargando(false)),
    []
  );

  useEffect(() => {
    listarEspecialidades().then(setEspecialidades).catch(() => {});
    cargar(filtros);
    // Solo al entrar; después se busca con el botón "Buscar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buscar(evento) {
    evento.preventDefault();
    setCargando(true);
    setAviso(null);
    cargar(filtros);
  }

  async function accionRapida(cita, accion, texto) {
    setProcesandoId(cita.id);
    setAviso(null);
    try {
      await accion(cita.id);
      setAviso({ tipo: "success", texto });
      await cargar(filtros);
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setProcesandoId(null);
    }
  }

  const cuantas = (valor) => citas.filter((c) => c.estado_visible === valor).length;
  const grupos = GRUPOS_ESTADO.filter(([valor]) => valor === estado || cuantas(valor) > 0);
  const visibles = estado ? citas.filter((c) => c.estado_visible === estado) : citas;
  const riesgoAlto = visibles.filter((c) => c.riesgo?.nivel === "alto").length;

  return (
    <>
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Gestión de citas</h1>
          <p className="admin-subtitulo">Citas de todos los pacientes, con su estado y nivel estimado de inasistencia.</p>
        </div>
      </div>

      <div className="info-admin info-admin--icono">
        <IconoInfo />
        <span>
          El nivel estimado de inasistencia es un criterio de acompañamiento (recordatorio, llamada, confirmación).{" "}
          <strong>No debe utilizarse para negar la atención.</strong>
        </span>
      </div>

      <form className="filtros-admin filtros-admin--busqueda" onSubmit={buscar}>
        <div className="field filtros-admin__buscar">
          <label htmlFor="buscar">Buscar</label>
          <div className="campo-con-icono">
            <IconoBuscar />
            <input
              id="buscar"
              value={filtros.buscar}
              onChange={(e) => setFiltros({ ...filtros, buscar: e.target.value })}
              placeholder="Paciente, documento o comprobante"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="desde">Desde</label>
          <input id="desde" type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="hasta">Hasta</label>
          <input id="hasta" type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="especialidad_id">Especialidad</label>
          <select
            id="especialidad_id"
            value={filtros.especialidad_id}
            onChange={(e) => setFiltros({ ...filtros, especialidad_id: e.target.value })}
          >
            <option value="">Todas</option>
            {especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn--primary" type="submit" disabled={cargando}>
          <IconoBuscar />
          {cargando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {aviso && <div className={`alert alert--${aviso.tipo}`}>{aviso.texto}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {!cargando && (
        <div className="barra-chips">
          <div className="chips-estado" role="group" aria-label="Filtrar por estado">
            <button
              type="button"
              className={`chip-estado ${estado === "" ? "is-activo" : ""}`}
              aria-pressed={estado === ""}
              onClick={() => setEstado("")}
            >
              Todas <span className="chip-estado__conteo">{citas.length}</span>
            </button>
            {grupos.map(([valor, texto, color]) => (
              <button
                key={valor}
                type="button"
                className={`chip-estado ${estado === valor ? "is-activo" : ""}`}
                aria-pressed={estado === valor}
                onClick={() => setEstado(valor)}
              >
                <span className="chip-estado__punto" style={{ background: color }} aria-hidden="true" />
                {texto} <span className="chip-estado__conteo">{cuantas(valor)}</span>
              </button>
            ))}
          </div>
          {riesgoAlto > 0 && <span className="barra-chips__alerta">{riesgoAlto} con riesgo alto</span>}
        </div>
      )}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Especialidad</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Riesgo estimado</th>
              <th>Recordatorio</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="celda-persona">
                    <span
                      className={`celda-persona__iniciales ${c.riesgo?.nivel === "alto" ? "celda-persona__iniciales--alerta" : ""}`}
                      aria-hidden="true"
                    >
                      {iniciales(c.paciente.nombre)}
                    </span>
                    <span className="celda-persona__textos">
                      <span className="celda-persona__nombre">{c.paciente.nombre}</span>
                      <span className="celda-persona__dato">Doc. {c.paciente.numero_documento}</span>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="celda-doble">
                    <span>{c.especialidad}</span>
                    <span className="celda-doble__dato">{c.especialista}</span>
                  </span>
                </td>
                <td>
                  <span className="celda-doble celda-doble--fija">
                    <span>{diaCorto(c.fecha)}</span>
                    <span className="celda-doble__dato">{formatearHora(c.hora)}</span>
                  </span>
                </td>
                <td>
                  <EstadoBadge cita={c} textos={ESTADO_PERSONAL} />
                </td>
                <td>
                  <IndicadorRiesgo riesgo={c.riesgo} />
                </td>
                <td>
                  <span className="celda-doble celda-doble--fija">
                    {c.recordatorio_enviado_en ? (
                      <span>Enviado {diaCorto(c.recordatorio_enviado_en)}</span>
                    ) : (
                      <span className="celda-doble__aviso">No enviado</span>
                    )}
                    <span className="celda-doble__dato">{CANALES[c.canal_recordatorio]}</span>
                  </span>
                </td>
                <td>
                  <div className="acciones-tabla">
                    <Link to={`/admin/citas/${c.id}`} className="btn btn--primary btn--compacto">
                      Ver detalle
                    </Link>
                    {c.acciones.confirmar && (
                      <BotonIcono
                        nombre={`Confirmar la asistencia de ${c.paciente.nombre}`}
                        disabled={procesandoId === c.id}
                        onClick={() => accionRapida(c, confirmarCitaAdmin, `Asistencia de ${c.paciente.nombre} confirmada.`)}
                      >
                        <IconoConfirmar />
                      </BotonIcono>
                    )}
                    {c.acciones.recordatorio && (
                      <BotonIcono
                        nombre={`Enviar recordatorio a ${c.paciente.nombre}`}
                        disabled={procesandoId === c.id}
                        onClick={() =>
                          accionRapida(
                            c,
                            enviarRecordatorioAdmin,
                            `Recordatorio enviado a ${c.paciente.nombre} por ${CANALES[c.canal_recordatorio]}.`
                          )
                        }
                      >
                        <IconoRecordatorio />
                      </BotonIcono>
                    )}
                    {c.acciones.contactar && (
                      <BotonIcono nombre={`Llamar a ${c.paciente.nombre}`} href={`tel:${c.paciente.telefono_whatsapp}`}>
                        <IconoLlamar />
                      </BotonIcono>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && visibles.length === 0 && <p className="tabla-vacia">No hay citas con esos filtros.</p>}
      </div>
    </>
  );
}
