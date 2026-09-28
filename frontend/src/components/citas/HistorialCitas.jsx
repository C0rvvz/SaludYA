import { useMemo, useState } from "react";
import { capitalizar } from "../../utils/formato";

/**
 * Historial de citas — HU-28.
 *
 * Criterio 1: citas anteriores (atendidas, a las que no asistió,
 * canceladas y reprogramadas: en el Planning Poker se acordó incluir
 * todas, cada una con su estado).
 * Criterio 2: organizadas por fecha, agrupadas por mes, lo más reciente
 * primero.
 * Criterio 3: cada una con su información principal (la tarjeta de la
 * lista y, al tocarla, el detalle completo).
 * Criterio 4: el backend solo devuelve citas del paciente autenticado.
 */

const FILTROS = [
  { id: "todas", titulo: "Todas" },
  { id: "atendida", titulo: "Atendidas" },
  { id: "no_asistio", titulo: "No asistió" },
  { id: "cancelada", titulo: "Canceladas" },
  { id: "reprogramada", titulo: "Reprogramadas" },
];

function tituloDelMes(fechaIso) {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  return capitalizar(new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(fecha));
}

// `citas` llegan ya ordenadas de la más reciente a la más antigua.
export default function HistorialCitas({ citas, renderCita }) {
  const [filtro, setFiltro] = useState("todas");

  const conteos = useMemo(() => {
    const cuenta = { todas: citas.length };
    for (const c of citas) cuenta[c.estado_visible] = (cuenta[c.estado_visible] ?? 0) + 1;
    return cuenta;
  }, [citas]);

  // Solo se ofrecen filtros que tengan citas, para no mostrar opciones
  // vacías. Si el filtro elegido se quedó sin citas, se vuelve a "Todas".
  const filtrosVisibles = FILTROS.filter((f) => f.id === "todas" || conteos[f.id]);
  const activo = filtrosVisibles.some((f) => f.id === filtro) ? filtro : "todas";

  const grupos = useMemo(() => {
    const visibles = activo === "todas" ? citas : citas.filter((c) => c.estado_visible === activo);
    const porMes = new Map();
    for (const c of visibles) {
      const clave = c.fecha.slice(0, 7); // AAAA-MM
      if (!porMes.has(clave)) porMes.set(clave, { titulo: tituloDelMes(c.fecha), citas: [] });
      porMes.get(clave).citas.push(c);
    }
    return Array.from(porMes.values());
  }, [citas, activo]);

  return (
    <>
      {filtrosVisibles.length > 2 && (
        <div className="filtros-historial" role="group" aria-label="Filtrar el historial por resultado">
          {filtrosVisibles.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={activo === f.id}
              className={`filtro-historial ${activo === f.id ? "is-active" : ""}`}
              onClick={() => setFiltro(f.id)}
            >
              {f.titulo} ({conteos[f.id]})
            </button>
          ))}
        </div>
      )}

      {grupos.length === 0 ? (
        <p className="empty-state">No hay citas con ese filtro.</p>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.titulo} className="grupo-mes" aria-label={grupo.titulo}>
            <h2 className="grupo-mes__titulo">{grupo.titulo}</h2>
            <div className="lista-citas">{grupo.citas.map(renderCita)}</div>
          </section>
        ))
      )}
    </>
  );
}
