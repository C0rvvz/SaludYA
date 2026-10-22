import { Barras, CabezaTarjeta, Cifra, Columnas, ConPeriodo, Dona } from "../../components/admin/Reportes";
import { CALIFICACIONES, CANALES } from "../../utils/citas";
import { capitalizar, formatearDuracion, formatearPorcentaje } from "../../utils/formato";
import { COLORES } from "../../utils/graficas";

const DIRECCION = {
  aumenta: ["La inasistencia aumentó respecto al tramo anterior.", "reporte__destacado--peligro"],
  disminuye: ["La inasistencia disminuyó respecto al tramo anterior.", "reporte__destacado--exito"],
  se_mantiene: ["La inasistencia se mantuvo igual que en el tramo anterior.", ""],
};

const citas = (n) => `${n} ${n === 1 ? "cita" : "citas"}`;
const porcentaje = (parte, total) => (total ? Math.round((100 * parte) / total) : null);

/** "Mayor: Cardiología (5 citas)" — el primero de una lista ya ordenada de mayor a menor. */
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
    <ConPeriodo titulo="Reportes" descripcion="Indicadores de gestión de citas para el periodo seleccionado.">
      {(r) => {
        const cerradas = r.atendidas + r.no_asistio;
        const demanda = r.demanda[0];
        const inasistencia = r.inasistencia_por_especialidad[0];
        const canal = r.canales[0];
        const s = r.satisfaccion;
        const cuantas = (calificacion) => s.distribucion.find((d) => d.calificacion === calificacion)?.cantidad ?? 0;
        const tresOMenos = s.distribucion.filter((d) => d.calificacion <= 3).reduce((suma, d) => suma + d.cantidad, 0);
        const [textoTendencia, claseTendencia] = DIRECCION[r.tendencia_direccion] ?? [
          "Aún no hay datos suficientes: se necesitan dos tramos con citas ya cerradas.",
          "",
        ];

        return (
          <div className="reporte">
            <section className="card" aria-labelledby="reporte-indicadores">
              <CabezaTarjeta id="reporte-indicadores" titulo="Indicadores de citas" dato={capitalizar(r.periodo_texto)} />
              <div className="cifras">
                <Cifra
                  valor={formatearPorcentaje(r.porcentaje_inasistencia)}
                  nombre="Inasistencia"
                  tono="peligro"
                  detalle={`${r.no_asistio} de ${cerradas} citas ya cerradas`}
                />
                <Cifra
                  valor={r.confirmadas}
                  nombre="Confirmadas"
                  tono="exito"
                  detalle={`${formatearPorcentaje(r.porcentaje_confirmadas)} de vigentes`}
                />
                <Cifra
                  valor={`${r.canceladas_a_tiempo} / ${r.canceladas}`}
                  nombre="Cancelaciones oportunas"
                  detalle="Con 24 h o más de anticipación"
                />
                <Cifra
                  valor={r.cupos_reasignados}
                  nombre="Citas reasignadas"
                  detalle={`De ${r.cupos_liberados} horarios liberados`}
                />
                <Cifra
                  valor={formatearDuracion(r.minutos_promedio_reasignacion)}
                  nombre="Tiempo de reasignación"
                  detalle={
                    r.cupos_reasignados
                      ? "Promedio por cupo, desde que se libera hasta que se ocupa"
                      : "Aún no se ha reasignado ningún cupo en este periodo"
                  }
                />
              </div>
            </section>

            <div className="reporte__columnas">
              {/* HU-71: satisfacción de los pacientes en el periodo */}
              <section className="card" aria-labelledby="reporte-satisfaccion">
                <CabezaTarjeta
                  id="reporte-satisfaccion"
                  titulo="Satisfacción de los pacientes"
                  dato={s.calificaciones ? `${s.calificaciones} calificaciones` : null}
                />
                {s.calificaciones ? (
                  <>
                    <Dona
                      valor={s.promedio.toLocaleString("es-CO")}
                      texto={`de 5 · ${CALIFICACIONES[Math.round(s.promedio)]}`}
                      segmentos={[
                        { nombre: "5 · Excelente", valor: cuantas(5), color: COLORES.satisfaccion[0] },
                        { nombre: "4 · Buena", valor: cuantas(4), color: COLORES.satisfaccion[1] },
                        { nombre: "3 o menos", valor: tresOMenos, color: COLORES.satisfaccion[2] },
                      ]}
                    />
                    <div className="cifras">
                      <Cifra
                        valor={formatearPorcentaje(s.porcentaje_satisfechos)}
                        nombre="Pacientes satisfechos"
                        tono="exito"
                        detalle="Calificación 4 o 5"
                      />
                      <Cifra
                        valor={formatearPorcentaje(porcentaje(s.calificaciones, r.atendidas))}
                        nombre="Tasa de respuesta"
                        detalle={`${s.calificaciones} de ${citas(r.atendidas)} atendidas`}
                      />
                    </div>
                  </>
                ) : (
                  <p className="reporte__destacado">
                    Aún no hay calificaciones en este periodo. Los pacientes califican su atención desde "Mis
                    citas" cuando la cita queda registrada como atendida.
                  </p>
                )}
              </section>

              <section className="card" aria-labelledby="reporte-tendencia">
                <CabezaTarjeta id="reporte-tendencia" titulo="Tendencia de inasistencia" dato="Por tramo del periodo" />
                <p className={`reporte__destacado ${claseTendencia}`}>{textoTendencia}</p>
                <Columnas
                  datos={r.tendencia.map((t) => ({
                    nombre: t.etiqueta,
                    valor: t.porcentaje ?? 0,
                    texto: formatearPorcentaje(t.porcentaje),
                  }))}
                />
              </section>
            </div>

            <div className="reporte__columnas">
              <section className="card" aria-labelledby="reporte-demanda">
                <CabezaTarjeta
                  id="reporte-demanda"
                  titulo="Demanda por especialidad"
                  dato={
                    <Destacado
                      texto="Mayor"
                      primero={demanda?.cantidad ? demanda.nombre : null}
                      valor={citas(demanda?.cantidad)}
                    />
                  }
                />
                <Barras datos={r.demanda.map((e) => ({ nombre: e.nombre, valor: e.cantidad }))} />
              </section>

              <section className="card" aria-labelledby="reporte-inasistencia">
                <CabezaTarjeta
                  id="reporte-inasistencia"
                  titulo="Inasistencia por especialidad"
                  dato={
                    <Destacado
                      texto="Mayor"
                      primero={inasistencia?.porcentaje != null ? inasistencia.especialidad : null}
                      valor={formatearPorcentaje(inasistencia?.porcentaje)}
                    />
                  }
                />
                <Barras
                  datos={r.inasistencia_por_especialidad.map((e) => ({
                    nombre: e.especialidad,
                    valor: e.porcentaje ?? 0,
                    texto: formatearPorcentaje(e.porcentaje),
                  }))}
                />
              </section>

              <section className="card" aria-labelledby="reporte-canales">
                <CabezaTarjeta
                  id="reporte-canales"
                  titulo="Canales de contacto"
                  dato={
                    <Destacado
                      texto="Más utilizado"
                      primero={canal?.cantidad ? CANALES[canal.canal] : null}
                      valor={citas(canal?.cantidad)}
                    />
                  }
                />
                {r.canales.some((c) => c.cantidad) && (
                  <Dona
                    valor={formatearPorcentaje(
                      porcentaje(
                        canal.cantidad,
                        r.canales.reduce((suma, c) => suma + c.cantidad, 0)
                      )
                    )}
                    texto={CANALES[canal.canal]}
                    segmentos={r.canales.map((c, i) => ({
                      nombre: CANALES[c.canal] ?? c.canal,
                      valor: c.cantidad,
                      color: COLORES.canales[i % COLORES.canales.length],
                    }))}
                  />
                )}
              </section>
            </div>
          </div>
        );
      }}
    </ConPeriodo>
  );
}
