import { Link } from "react-router-dom";
import {
  Barras,
  BarraApilada,
  CabezaTarjeta,
  Cifra,
  ConPeriodo,
  Dona,
} from "../../components/admin/Reportes";
import { iniciales } from "../../utils/avatar";
import { COLORES } from "../../utils/graficas";
import { CANALES } from "../../utils/citas";
import { capitalizar, formatearDuracion, formatearFechaLarga, formatearPorcentaje } from "../../utils/formato";

const porcentaje = (parte, total) => (total ? Math.round((100 * parte) / total) : null);

/**
 * Resumen (antes "Dashboard") — HU-52 (resumen general), HU-44 (citas del día), HU-46
 * (inasistencia estimada del día e indicadores de solicitudes), HU-47
 * (revisiones), HU-48 (confirmaciones), HU-49 (canales), HU-50
 * (inasistencias por especialidad) y HU-51 (inasistencias por paciente).
 * El periodo se elige con HU-68; la sección "Hoy" es siempre del día.
 */
export default function AdminDashboardPage() {
  return (
    <ConPeriodo
      titulo="Resumen"
      descripcion="Estado general de la agenda. Los indicadores se calculan en tiempo real con los datos registrados."
    >
      {(r) => {
        const h = r.hoy;
        const periodo = capitalizar(r.periodo_texto);
        const canales = r.canales.map((c, i) => ({
          nombre: CANALES[c.canal] ?? c.canal,
          valor: c.cantidad,
          color: COLORES.canales[i % COLORES.canales.length],
        }));
        const totalCanales = canales.reduce((suma, c) => suma + c.valor, 0);
        const confirmacion = porcentaje(r.confirmadas, r.confirmadas + r.sin_confirmar);
        return (
          <div className="reporte">
            <section className="card" aria-labelledby="dashboard-hoy">
              <CabezaTarjeta id="dashboard-hoy" titulo="Hoy" dato={formatearFechaLarga(h.fecha)} />
              <div className="cifras">
                <Cifra valor={h.programadas} nombre="Citas programadas" />
                <Cifra
                  valor={h.confirmadas}
                  nombre="Confirmadas"
                  tono="exito"
                  detalle={h.programadas ? formatearPorcentaje(porcentaje(h.confirmadas, h.programadas)) : null}
                />
                <Cifra valor={h.pendientes} nombre="Pendientes de confirmación" tono="aviso" />
                <Cifra valor={h.canceladas} nombre="Canceladas" tono="peligro" />
              </div>
              <BarraApilada
                segmentos={[
                  { nombre: "Confirmadas", valor: h.confirmadas, color: COLORES.confirmadas },
                  { nombre: "Pendientes", valor: h.pendientes, color: COLORES.pendientes },
                  { nombre: "Canceladas", valor: h.canceladas, color: COLORES.canceladas },
                ]}
              />
              <div className="cifras">
                <Cifra valor={h.programadas} nombre="Horarios ocupados" />
                <Cifra valor={h.horarios_liberados} nombre="Horarios liberados" />
                <Cifra valor={h.horarios_reasignados} nombre="Horarios reasignados" detalle="Ocupados nuevamente" />
                <Cifra
                  valor={formatearPorcentaje(h.inasistencia_estimada)}
                  nombre="Inasistencia estimada"
                  detalle="Promedio de las citas restantes"
                />
              </div>
            </section>

            <section className="card" aria-labelledby="dashboard-periodo">
              <CabezaTarjeta id="dashboard-periodo" titulo="Resumen del periodo" dato={periodo} />
              <div className="cifras">
                <Cifra valor={r.citas} nombre="Citas agendadas" />
                <Cifra
                  valor={r.confirmadas}
                  nombre="Confirmadas"
                  detalle={`${formatearPorcentaje(r.porcentaje_confirmadas)} de vigentes`}
                />
                <Cifra valor={r.canceladas} nombre="Cancelaciones" />
                <Cifra
                  valor={r.no_asistio}
                  nombre="Inasistencias"
                  detalle={`${formatearPorcentaje(r.porcentaje_inasistencia)} de cerradas`}
                />
                <Cifra valor={r.en_lista_espera} nombre="Lista de espera" detalle="Pacientes activos" />
              </div>
            </section>

            <section className="card" aria-labelledby="dashboard-solicitudes">
              <CabezaTarjeta id="dashboard-solicitudes" titulo="Solicitudes escritas" dato={periodo} />
              <div className="cifras">
                <Cifra
                  valor={r.solicitudes.recibidas}
                  nombre="Radicadas"
                  detalle={`${r.solicitudes.formales} para pedir otra fecha · ${r.solicitudes.derechos_peticion} derechos de petición`}
                />
                <Cifra valor={r.solicitudes.pendientes_revision} nombre="Pendientes de revisión" tono="aviso" />
                <Cifra valor={r.solicitudes.pendientes_eps} nombre="En trámite con la EPS" />
              </div>
              <div className="cifras">
                <Cifra valor={r.solicitudes.prioritarias_aprobadas} nombre="Prioritarias aprobadas" />
                <Cifra
                  valor={formatearDuracion(r.solicitudes.minutos_promedio_revision)}
                  nombre="Tiempo medio de revisión"
                  detalle="Desde que se radica hasta la primera decisión"
                />
                <Cifra valor={r.solicitudes.citas_asignadas} nombre="Citas asignadas" detalle="Tras revisión" />
              </div>
            </section>

            <div className="reporte__columnas">
              <section className="card" aria-labelledby="dashboard-confirmacion">
                <h2 className="admin-card__titulo" id="dashboard-confirmacion">
                  Confirmación de asistencia
                </h2>
                <Dona
                  valor={formatearPorcentaje(confirmacion)}
                  texto="confirmadas"
                  segmentos={[
                    { nombre: "Confirmadas", valor: r.confirmadas, color: COLORES.confirmadas },
                    { nombre: "Sin confirmar", valor: r.sin_confirmar, color: COLORES.sinConfirmar },
                  ]}
                />
              </section>

              <section className="card" aria-labelledby="dashboard-canal">
                <h2 className="admin-card__titulo" id="dashboard-canal">
                  Canal de agendamiento
                </h2>
                <Dona
                  valor={canales[0] ? formatearPorcentaje(porcentaje(canales[0].valor, totalCanales)) : "—"}
                  texto={canales[0]?.nombre ?? "Sin datos"}
                  segmentos={canales}
                />
                <p className="texto-suave">Canal que eligió el paciente al agendar la cita.</p>
              </section>

              <section className="card" aria-labelledby="dashboard-inasistencia">
                <h2 className="admin-card__titulo" id="dashboard-inasistencia">
                  Inasistencia por especialidad
                </h2>
                <Barras
                  etiqueta="Inasistencia por especialidad"
                  datos={[...r.inasistencia_por_especialidad]
                    .sort((a, b) => b.no_asistio - a.no_asistio)
                    .map((e) => ({ nombre: e.especialidad, valor: e.no_asistio }))}
                />
              </section>
            </div>

            <section className="card" aria-labelledby="dashboard-pacientes">
              <h2 className="admin-card__titulo" id="dashboard-pacientes">
                Inasistencia por paciente
              </h2>
              {r.inasistencia_por_paciente.length === 0 ? (
                <p className="texto-suave">Ningún paciente ha faltado a una cita en este periodo.</p>
              ) : (
                <div className="tabla-contenedor">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Paciente</th>
                        <th>Documento</th>
                        <th>Inasistencias</th>
                        <th>Citas del periodo</th>
                        <th>Historial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.inasistencia_por_paciente.map((p) => (
                        <tr key={p.paciente_id}>
                          <td>
                            <span className="celda-persona">
                              <span className="celda-persona__iniciales" aria-hidden="true">
                                {iniciales(p.nombre)}
                              </span>
                              <span className="celda-persona__nombre">{p.nombre}</span>
                            </span>
                          </td>
                          <td>{p.numero_documento}</td>
                          <td>{p.no_asistio}</td>
                          <td>{p.citas}</td>
                          <td>
                            <Link to={`/admin/citas/${p.cita_id}`}>Ver historial</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        );
      }}
    </ConPeriodo>
  );
}
