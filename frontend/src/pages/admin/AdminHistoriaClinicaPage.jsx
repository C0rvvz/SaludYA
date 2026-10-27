import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconoBuscar, IconoCandado } from "../../components/admin/IconosAdmin";
import { listarHistoriaClinica } from "../../api/admin";
import { listarEspecialidades } from "../../api/catalogo";
import { listarEps } from "../../api/eps";
import { iniciales } from "../../utils/avatar";
import { SIGLA_DOCUMENTO } from "../../utils/citas";
import { AVISO_RESERVADO, CLASE_ESTADO_FORMULA, PERIODOS } from "../../utils/historiaClinica";

/**
 * Personal › Historia clínica (Médico y Coordinación médica): los pacientes
 * atendidos, cada uno con su última consulta del periodo y cómo va la
 * entrega de su fórmula. El médico solo ve a sus pacientes. Al abrir uno se
 * ve el detalle (AdminHistoriaDetallePage), y esa consulta queda en la auditoría.
 */

const FILTROS_INICIALES = { buscar: "", especialidad_id: "", eps: "", periodo: "30" };

const diaCorto = (fechaIso) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
    .format(new Date(fechaIso.length > 10 ? fechaIso : `${fechaIso}T00:00:00`))
    .replace(".", "")
    .replace(" de ", " ");

// "Hoy", "Ayer" o "12 oct"
function cuandoSeConsulto(fechaHora) {
  const dias = Math.round(
    (new Date(new Date().toDateString()) - new Date(new Date(fechaHora).toDateString())) / 86_400_000
  );
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return diaCorto(fechaHora);
}

export default function AdminHistoriaClinicaPage() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [especialidades, setEspecialidades] = useState([]);
  const [eps, setEps] = useState([]);
  const [listado, setListado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Quien la llama marca "cargando" (al entrar ya lo está).
  const cargar = useCallback((f, pagina = 1) => {
    return listarHistoriaClinica({ ...f, pagina })
      .then((datos) => {
        setListado(datos);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    listarEspecialidades().then(setEspecialidades).catch(() => {});
    listarEps().then(setEps).catch(() => {});
    cargar(FILTROS_INICIALES);
  }, [cargar]);

  function buscar(evento) {
    evento.preventDefault();
    irA(1);
  }

  function irA(pagina) {
    setCargando(true);
    cargar(filtros, pagina);
  }

  const cambiar = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });
  const pacientes = listado?.pacientes ?? [];
  const paginas = listado ? Math.max(1, Math.ceil(listado.total / listado.por_pagina)) : 1;

  return (
    <>
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Historia clínica</h1>
          <p className="admin-subtitulo">
            Pacientes atendidos con diagnóstico y fórmula médica. Seleccione un paciente para ver el detalle.
          </p>
        </div>
      </div>

      <div className="info-admin info-admin--icono info-admin--reservado">
        <IconoCandado tamano={18} />
        <span>{AVISO_RESERVADO}</span>
      </div>

      <form className="filtros-admin filtros-admin--busqueda" onSubmit={buscar}>
        <div className="field filtros-admin__buscar">
          <label htmlFor="buscar">Buscar</label>
          <div className="campo-con-icono">
            <IconoBuscar />
            <input id="buscar" value={filtros.buscar} onChange={cambiar("buscar")} placeholder="Nombre o documento" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="especialidad_id">Especialidad</label>
          <select id="especialidad_id" value={filtros.especialidad_id} onChange={cambiar("especialidad_id")}>
            <option value="">Todas</option>
            {especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="eps">EPS</label>
          <select id="eps" value={filtros.eps} onChange={cambiar("eps")}>
            <option value="">Todas</option>
            {eps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
            <option value="particular">Particulares (sin EPS)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="periodo">Periodo</label>
          <select id="periodo" value={filtros.periodo} onChange={cambiar("periodo")}>
            {PERIODOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn--primary" type="submit" disabled={cargando}>
          <IconoBuscar />
          {cargando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Documento</th>
              <th>EPS</th>
              <th>Última consulta</th>
              <th>Fórmula</th>
              <th>Consultado</th>
              <th>
                <span className="sr-only">Abrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pacientes.map((p) => (
              <tr key={p.paciente_id}>
                <td>
                  <span className="celda-persona">
                    <span className="celda-persona__iniciales" aria-hidden="true">
                      {iniciales(p.nombre)}
                    </span>
                    <Link to={`/admin/historia-clinica/${p.cita_id}`} className="celda-persona__nombre enlace-fila">
                      {p.nombre}
                    </Link>
                  </span>
                </td>
                <td className="celda-nowrap">
                  {SIGLA_DOCUMENTO[p.tipo_documento] ?? p.tipo_documento} {p.numero_documento}
                </td>
                <td>{p.eps ?? "Particular"}</td>
                <td>
                  <span className="celda-doble">
                    <span>
                      {diaCorto(p.fecha)} · {p.especialidad}
                    </span>
                    <span className="celda-doble__dato">{p.especialista}</span>
                  </span>
                </td>
                <td>
                  <span className={`badge ${CLASE_ESTADO_FORMULA[p.formula_estado]}`}>{p.formula_estado_texto}</span>
                </td>
                <td className="celda-nowrap">{p.consultado_en ? cuandoSeConsulto(p.consultado_en) : "—"}</td>
                <td>
                  <Link
                    to={`/admin/historia-clinica/${p.cita_id}`}
                    className="boton-icono"
                    aria-label={`Ver la historia clínica de ${p.nombre}`}
                    title="Ver la historia clínica"
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
                      <path d="M9.5 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && listado && pacientes.length === 0 && (
          <p className="empty-state">No hay pacientes atendidos con esos filtros.</p>
        )}
      </div>

      {listado && listado.total > 0 && (
        <div className="paginacion-admin">
          <span>
            Mostrando {pacientes.length} de {listado.total} paciente{listado.total === 1 ? "" : "s"}
          </span>
          <div className="acciones-admin">
            <button
              type="button"
              className="btn btn--outline btn--compacto"
              disabled={cargando || listado.pagina <= 1}
              onClick={() => irA(listado.pagina - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="btn btn--outline btn--compacto"
              disabled={cargando || listado.pagina >= paginas}
              onClick={() => irA(listado.pagina + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </>
  );
}
