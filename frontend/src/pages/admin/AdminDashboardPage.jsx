import { Link } from "react-router-dom";
import { Barras, Cifra, ConPeriodo } from "../../components/admin/Reportes";
import { CANALES } from "../../utils/citas";
import { formatearDuracion, formatearFechaLarga, formatearPorcentaje } from "../../utils/formato";

/**
 * Dashboard — HU-52 (resumen general), HU-44 (citas del día), HU-46
 * (inasistencia estimada del día e indicadores de solicitudes), HU-47
 * (revisiones), HU-48 (confirmaciones), HU-49 (canales), HU-50
 * (inasistencias por especialidad) y HU-51 (inasistencias por paciente).
 * El periodo se elige con HU-68; la sección "Hoy" es siempre del día.
 */
export default function AdminDashboardPage() {
  return (
    <>
      <h1 className="admin-titulo">Dashboard</h1>
      <p className="admin-subtitulo">
        Estado general de las citas. Las cifras se calculan al momento con los datos registrados.
      </p>

      <ConPeriodo>
        {(r) => (
          <div className="reporte">
            <section className="card">
              <h2 className="admin-card__titulo">Hoy, {formatearFechaLarga(r.hoy.fecha)}</h2>
              <div className="cifras">
                <Cifra valor={r.hoy.programadas} nombre="Citas programadas" />
                <Cifra valor={r.hoy.confirmadas} nombre="Confirmadas" />
                <Cifra valor={r.hoy.pendientes} nombre="Pendientes de confirmar" />
                <Cifra valor={r.hoy.canceladas} nombre="Canceladas" />
              </div>
              <div className="cifras">
                <Cifra valor={r.hoy.programadas} nombre="Horarios ocupados" />
                <Cifra valor={r.hoy.horarios_liberados} nombre="Horarios liberados" />
                <Cifra
                  valor={r.hoy.horarios_reasignados}
                  nombre="Horarios reasignados"
                  detalle="Liberados que volvió a tomar otro paciente"
                />
                <Cifra
                  valor={formatearPorcentaje(r.hoy.inasistencia_estimada)}
                  nombre="Inasistencia estimada"
                  detalle="Promedio del riesgo de las citas que faltan hoy"
                />
              </div>
            </section>

            <section className="card">
              <h2 className="admin-card__titulo">Resumen de {r.periodo_texto.toLowerCase()}</h2>
              <div className="cifras">
                <Cifra valor={r.citas} nombre="Citas agendadas" />
                <Cifra
                  valor={r.confirmadas}
                  nombre="Confirmaciones"
                  detalle={`${formatearPorcentaje(r.porcentaje_confirmadas)} de las citas vigentes`}
                />
                <Cifra valor={r.canceladas} nombre="Cancelaciones" />
                <Cifra
                  valor={r.no_asistio}
                  nombre="Inasistencias"
                  detalle={`${formatearPorcentaje(r.porcentaje_inasistencia)} de las citas ya cerradas`}
                />
              </div>
              <div className="cifras">
                <Cifra valor={r.en_lista_espera} nombre="Lista de espera" detalle="Pacientes esperando cupo ahora" />
              </div>
            </section>

            <section className="card">
              <h2 className="admin-card__titulo">Solicitudes y revisiones de {r.periodo_texto.toLowerCase()}</h2>
              <div className="cifras">
                <Cifra
                  valor={r.solicitudes.recibidas}
                  nombre="Solicitudes recibidas"
                  detalle={`${r.solicitudes.formales} formales · ${r.solicitudes.derechos_peticion} derechos de petición`}
                />
                <Cifra valor={r.solicitudes.pendientes_revision} nombre="Pendientes de revisión" />
                <Cifra valor={r.solicitudes.prioritarias_aprobadas} nombre="Revisiones prioritarias aprobadas" />
                <Cifra valor={r.solicitudes.pendientes_eps} nombre="Pendientes de respuesta de la EPS" />
              </div>
              <div className="cifras">
                <Cifra
                  valor={formatearDuracion(r.solicitudes.minutos_promedio_revision)}
                  nombre="Tiempo promedio de revisión"
                  detalle="Desde que se radica hasta la primera decisión"
                />
                <Cifra valor={r.solicitudes.citas_asignadas} nombre="Citas asignadas después de una revisión" />
              </div>
            </section>

            <div className="reporte__columnas">
              <section className="card">
                <h2 className="admin-card__titulo">Confirmaciones</h2>
                <Barras
                  datos={[
                    { nombre: "Confirmadas", valor: r.confirmadas },
                    { nombre: "Sin confirmar", valor: r.sin_confirmar },
                  ]}
                />
              </section>

              <section className="card">
                <h2 className="admin-card__titulo">Canales más utilizados</h2>
                <Barras datos={r.canales.map((c) => ({ nombre: CANALES[c.canal], valor: c.cantidad }))} />
                <p className="texto-suave">Canal que eligió el paciente al agendar la cita.</p>
              </section>

              <section className="card">
                <h2 className="admin-card__titulo">Inasistencias por especialidad</h2>
                <Barras
                  datos={[...r.inasistencia_por_especialidad]
                    .sort((a, b) => b.no_asistio - a.no_asistio)
                    .map((e) => ({ nombre: e.especialidad, valor: e.no_asistio }))}
                />
              </section>
            </div>

            <section className="card">
              <h2 className="admin-card__titulo">Inasistencias por paciente</h2>
              {r.inasistencia_por_paciente.length === 0 ? (
                <p className="empty-state">Ningún paciente ha faltado a una cita en este periodo.</p>
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
                          <td>{p.nombre}</td>
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
        )}
      </ConPeriodo>
    </>
  );
}
