import { Barras, Cifra, ConPeriodo } from "../../components/admin/Reportes";
import { CALIFICACIONES, CANALES } from "../../utils/citas";
import { formatearDuracion, formatearPorcentaje } from "../../utils/formato";

const DIRECCION = {
  aumenta: "La inasistencia aumentó frente al tramo anterior.",
  disminuye: "La inasistencia disminuyó frente al tramo anterior.",
  se_mantiene: "La inasistencia se mantuvo igual que en el tramo anterior.",
};

const citas = (n) => `${n} ${n === 1 ? "cita" : "citas"}`;

/** "Mayor demanda: Cardiología (5 citas)" — el primero de una lista ya ordenada de mayor a menor. */
function Destacado({ texto, primero, valor }) {
  return (
    <p className="reporte__destacado">
      {primero ? (
        <>
          {texto}: <strong>{primero}</strong> ({valor})
        </>
      ) : (
        "Sin datos en este periodo."
      )}
    </p>
  );
}

/**
 * Reportes — HU-69 (indicadores), HU-70 (tiempo en ocupar un cupo
 * liberado), HU-71 (satisfacción), HU-72 (demanda por especialidad),
 * HU-73 (inasistencia por especialidad), HU-74 (tendencia) y HU-75
 * (canales), todos del periodo elegido con HU-68.
 */
export default function AdminReportesPage() {
  return (
    <>
      <h1 className="admin-titulo">Reportes</h1>
      <p className="admin-subtitulo">Indicadores de la gestión de citas en el periodo elegido.</p>

      <ConPeriodo>
        {(r) => {
          const cerradas = r.atendidas + r.no_asistio;
          const demanda = r.demanda[0];
          const inasistencia = r.inasistencia_por_especialidad[0];
          const canal = r.canales[0];
          const s = r.satisfaccion;
          return (
            <div className="reporte">
              <section className="card">
                <h2 className="admin-card__titulo">Indicadores de citas: {r.periodo_texto.toLowerCase()}</h2>
                <div className="cifras">
                  <Cifra
                    valor={formatearPorcentaje(r.porcentaje_inasistencia)}
                    nombre="Inasistencia"
                    detalle={`${r.no_asistio} de ${cerradas} citas ya cerradas`}
                  />
                  <Cifra
                    valor={r.confirmadas}
                    nombre="Citas confirmadas"
                    detalle={`${formatearPorcentaje(r.porcentaje_confirmadas)} de las citas vigentes`}
                  />
                  <Cifra
                    valor={`${r.canceladas_a_tiempo} de ${r.canceladas}`}
                    nombre="Cancelaciones a tiempo"
                    detalle="Con 24 horas o más de anticipación"
                  />
                  <Cifra
                    valor={r.cupos_reasignados}
                    nombre="Citas reasignadas"
                    detalle={`De ${r.cupos_liberados} horarios liberados`}
                  />
                </div>
                <div className="cifras">
                  <Cifra
                    valor={formatearDuracion(r.minutos_promedio_reasignacion)}
                    nombre="Tiempo promedio para ocupar un cupo liberado"
                    detalle={
                      r.cupos_reasignados
                        ? "Desde que se libera el horario hasta que otro paciente lo agenda"
                        : "Aún no se ha reasignado ningún cupo en este periodo"
                    }
                  />
                </div>
              </section>

              {/* HU-71: satisfacción de los pacientes en el periodo */}
              <section className="card">
                <h2 className="admin-card__titulo">Satisfacción de los pacientes</h2>
                {s.calificaciones ? (
                  <>
                    <div className="cifras">
                      <Cifra
                        valor={`${s.promedio.toLocaleString("es-CO")} de 5`}
                        nombre="Calificación promedio"
                        detalle={CALIFICACIONES[Math.round(s.promedio)]}
                      />
                      <Cifra
                        valor={formatearPorcentaje(s.porcentaje_satisfechos)}
                        nombre="Pacientes satisfechos"
                        detalle="Calificaron su atención con 4 o 5"
                      />
                      <Cifra
                        valor={`${s.calificaciones} de ${r.atendidas}`}
                        nombre="Citas calificadas"
                        detalle="De las citas atendidas en el periodo"
                      />
                    </div>
                    <Barras
                      datos={s.distribucion.map((d) => ({
                        nombre: `${d.calificacion} ★ ${CALIFICACIONES[d.calificacion]}`,
                        valor: d.cantidad,
                      }))}
                    />
                  </>
                ) : (
                  <p className="reporte__destacado">
                    Aún no hay calificaciones en este periodo. Los pacientes califican su atención desde
                    "Mis citas" cuando la cita queda registrada como atendida.
                  </p>
                )}
              </section>

              <div className="reporte__columnas">
                <section className="card">
                  <h2 className="admin-card__titulo">Demanda por especialidad</h2>
                  <Destacado
                    texto="Mayor demanda"
                    primero={demanda?.cantidad ? demanda.nombre : null}
                    valor={citas(demanda?.cantidad)}
                  />
                  <Barras datos={r.demanda.map((e) => ({ nombre: e.nombre, valor: e.cantidad }))} />
                </section>

                <section className="card">
                  <h2 className="admin-card__titulo">Inasistencia por especialidad</h2>
                  <Destacado
                    texto="Mayor inasistencia"
                    primero={inasistencia?.porcentaje != null ? inasistencia.especialidad : null}
                    valor={formatearPorcentaje(inasistencia?.porcentaje)}
                  />
                  <Barras
                    datos={r.inasistencia_por_especialidad.map((e) => ({
                      nombre: e.especialidad,
                      valor: e.porcentaje ?? 0,
                      texto: formatearPorcentaje(e.porcentaje),
                    }))}
                  />
                </section>

                <section className="card">
                  <h2 className="admin-card__titulo">Uso de canales de contacto</h2>
                  <Destacado
                    texto="Más utilizado"
                    primero={canal?.cantidad ? CANALES[canal.canal] : null}
                    valor={citas(canal?.cantidad)}
                  />
                  <Barras datos={r.canales.map((c) => ({ nombre: CANALES[c.canal], valor: c.cantidad }))} />
                </section>
              </div>

              <section className="card">
                <h2 className="admin-card__titulo">Tendencia de inasistencia</h2>
                <p className="reporte__destacado">
                  {DIRECCION[r.tendencia_direccion] ??
                    "Aún no hay datos suficientes: se necesitan dos tramos con citas ya cerradas."}
                </p>
                <Barras
                  datos={r.tendencia.map((t) => ({
                    nombre: t.etiqueta,
                    valor: t.porcentaje ?? 0,
                    texto: `${formatearPorcentaje(t.porcentaje)} (${t.no_asistio} de ${t.atendidas + t.no_asistio})`,
                  }))}
                />
              </section>
            </div>
          );
        }}
      </ConPeriodo>
    </>
  );
}
