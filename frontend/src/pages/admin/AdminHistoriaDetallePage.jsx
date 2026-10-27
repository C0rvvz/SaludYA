import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useParams } from "react-router-dom";
import FormulaAdmin from "../../components/admin/FormulaAdmin";
import { IconoCandado } from "../../components/admin/IconosAdmin";
import SinPermisoHistoria from "../../components/admin/SinPermisoHistoria";
import FormulaImpresa from "../../components/citas/FormulaImpresa";
import { Chevron, IconoDescargar } from "../../components/Iconos";
import { obtenerHistoriaClinica, reenviarCodigoFormula, registrarFormulaAdmin } from "../../api/admin";
import { usePersonal } from "../../context/personal";
import { CANALES, SIGLA_DOCUMENTO } from "../../utils/citas";
import { formatearDiaMes, formatearFechaHora, formatearHora } from "../../utils/formato";
import { AVISO_RESERVADO, CLASE_ESTADO_FORMULA } from "../../utils/historiaClinica";

/**
 * Historia clínica de una consulta atendida (Médico y Coordinación médica):
 * diagnóstico con su código CIE-10 y la nota del médico, los medicamentos
 * con el estado de entrega de cada uno, las recomendaciones, la entrega en
 * farmacia ("Descargar fórmula" y "Reenviar código al paciente") y "Quién ha
 * consultado esta fórmula". Abajo, las demás consultas del paciente.
 *
 * Abrirla queda en la auditoría. Sin permiso (p. ej. Call center), o si el
 * médico abre a alguien que no es su paciente: "No tiene permiso…".
 */

function Dato({ etiqueta, children }) {
  return (
    <div className="dato-hc">
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Medicamentos({ formula, eps }) {
  return (
    <section className="card" aria-labelledby="titulo-medicamentos">
      <div className="admin-card__cabeza">
        <h2 className="admin-card__titulo" id="titulo-medicamentos">
          Medicamentos formulados
        </h2>
        <span className="admin-card__dato">
          {formula.cubierta_por_eps ? `Cubiertos por ${eps ?? "la EPS"}` : "Con costo para el paciente"}
        </span>
      </div>
      {formula.medicamentos.length === 0 ? (
        <p className="texto-suave">El médico no formuló medicamentos en esta consulta.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Dosis</th>
                <th>Frecuencia</th>
                <th>Duración</th>
                <th>Cantidad</th>
                <th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {formula.medicamentos.map((m, i) => (
                <tr key={i}>
                  <td>
                    <strong>{m.nombre}</strong>
                  </td>
                  <td>{m.dosis || "—"}</td>
                  <td>{m.indicacion}</td>
                  <td>{m.duracion || "—"}</td>
                  <td>{m.cantidad || "—"}</td>
                  <td>
                    <span className={`badge ${m.entregado ? "badge--success" : "badge--warning"}`}>
                      {m.entregado ? "Entregado" : "Pendiente"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EntregaEnFarmacia({ formula, ocupado, onDescargar, onReenviar }) {
  const total = formula.medicamentos.length;
  const estado =
    formula.estado_entrega === "parcial"
      ? `${formula.estado_entrega_texto} (${formula.entregados} de ${total})`
      : formula.estado_entrega_texto;
  return (
    <section className="card" aria-labelledby="titulo-entrega">
      <h2 className="admin-card__titulo" id="titulo-entrega">
        Entrega en farmacia
      </h2>
      <dl className="datos-hc">
        <Dato etiqueta="Código de reclamo">{formula.codigo}</Dato>
        <Dato etiqueta="Vigencia">
          {formula.vigente ? `Hasta el ${formatearDiaMes(formula.vence_en)}` : `Venció el ${formatearDiaMes(formula.vence_en)}`}
        </Dato>
        <Dato etiqueta="Farmacia">{formula.farmacia_entrega ?? "Todavía no ha reclamado"}</Dato>
        <Dato etiqueta="Última entrega">
          {formula.ultima_entrega_en ? formatearFechaHora(formula.ultima_entrega_en) : "—"}
        </Dato>
        <Dato etiqueta="Estado">
          <span className={`badge ${CLASE_ESTADO_FORMULA[formula.estado_entrega]}`}>{estado}</span>
        </Dato>
      </dl>
      <div className="acciones-admin">
        <button type="button" className="btn btn--outline" onClick={onDescargar}>
          <IconoDescargar tamano={16} />
          Descargar fórmula
        </button>
        {formula.vigente && (
          <button type="button" className="btn btn--outline" disabled={ocupado} onClick={onReenviar}>
            Reenviar código al paciente
          </button>
        )}
      </div>
    </section>
  );
}

function QuienHaConsultado({ accesos }) {
  return (
    <section className="card" aria-labelledby="titulo-accesos">
      <h2 className="admin-card__titulo" id="titulo-accesos">
        Quién ha consultado esta fórmula
      </h2>
      <ul className="accesos-hc">
        {accesos.map((a) => (
          <li key={`${a.quien}-${a.que}`}>
            <span>
              <strong>{a.quien}</strong> · {a.que}
              {a.veces > 1 && <span className="texto-suave"> ({a.veces} veces)</span>}
            </span>
            <span className="accesos-hc__fecha">{formatearFechaHora(a.fecha)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Al pasar a otra consulta del paciente, la página empieza de cero (key).
export default function AdminHistoriaDetallePage() {
  const { citaId } = useParams();
  return <DetalleHistoria key={citaId} citaId={citaId} />;
}

function DetalleHistoria({ citaId }) {
  const { tienePermiso } = usePersonal();
  const permitido = tienePermiso("historia_clinica");
  const [historia, setHistoria] = useState(null);
  const [error, setError] = useState(null); // { status, mensaje }
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(false);

  const cargar = useCallback(
    () =>
      obtenerHistoriaClinica(citaId)
        .then((datos) => {
          setHistoria(datos);
          setError(null);
        })
        .catch((err) => setError({ status: err.status, mensaje: err.message })),
    [citaId]
  );

  useEffect(() => {
    if (permitido) cargar();
  }, [permitido, cargar]);

  if (!permitido) return <SinPermisoHistoria citaId={citaId} />;
  if (error?.status === 403) return <SinPermisoHistoria citaId={citaId} mensaje={error.mensaje} />;

  const volver = (
    <Link to="/admin/historia-clinica" className="admin-volver">
      <span className="admin-volver__circulo">
        <Chevron hacia="izquierda" tamano={14} />
      </span>
      Volver al listado de pacientes
    </Link>
  );

  if (error) {
    return (
      <>
        {volver}
        <div className="alert alert--error">{error.mensaje}</div>
      </>
    );
  }
  if (!historia) return <p>Cargando la historia clínica…</p>;

  const { paciente: p, cita, formula } = historia;

  async function guardar(datos) {
    setOcupado(true);
    setAviso(null);
    try {
      setHistoria(await registrarFormulaAdmin(cita.id, datos));
      setAviso({
        tipo: "success",
        texto: formula
          ? "Fórmula corregida. El paciente ya ve los cambios en Mis citas."
          : `Fórmula registrada. Le avisamos al paciente por ${CANALES[cita.canal]}.`,
      });
      return true;
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function reenviar() {
    setOcupado(true);
    setAviso(null);
    try {
      const { canal } = await reenviarCodigoFormula(cita.id);
      setAviso({ tipo: "success", texto: `Le reenviamos el código al paciente por ${CANALES[canal] ?? canal}.` });
      cargar(); // aparece en "Quién ha consultado esta fórmula"
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  }

  function descargar() {
    // Se dibuja la fórmula para imprimir antes de abrir el diálogo, y se quita al cerrarlo.
    flushSync(() => setImprimiendo(true));
    window.print();
    setImprimiendo(false);
  }

  return (
    <>
      {volver}

      <div className="info-admin info-admin--icono info-admin--reservado">
        <IconoCandado tamano={18} />
        <span>{AVISO_RESERVADO.replace("Información reservada.", "Información reservada de la historia clínica.")}</span>
      </div>

      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">{p.nombre}</h1>
          <p className="admin-subtitulo">
            {SIGLA_DOCUMENTO[p.tipo_documento] ?? p.tipo_documento} {p.numero_documento} · {cita.especialidad} ·{" "}
            {cita.especialista} · {formatearDiaMes(cita.fecha)}, {formatearHora(cita.hora)} · {cita.sede}
          </p>
        </div>
        <div className="admin-encabezado__estado">
          <span className="badge badge--success">Atendida</span>
          <span className="admin-comprobante">{cita.numero_comprobante}</span>
        </div>
      </div>

      {aviso && (
        <div className={`alert alert--${aviso.tipo}`} role={aviso.tipo === "error" ? "alert" : "status"}>
          {aviso.texto}
        </div>
      )}

      {editando ? (
        <FormulaAdmin
          formula={formula}
          particular={!p.eps}
          ocupado={ocupado}
          onGuardar={guardar}
          onCancelar={() => setEditando(false)}
        />
      ) : formula ? (
        <div className="historia-clinica">
          <div className="historia-clinica__principal">
            <section className="card" aria-labelledby="titulo-diagnostico">
              <div className="admin-card__cabeza">
                <h2 className="admin-card__titulo" id="titulo-diagnostico">
                  Diagnóstico y nota del médico
                </h2>
                {historia.puede_editar && (
                  <button type="button" className="btn btn--outline btn--compacto" onClick={() => setEditando(true)}>
                    Corregir fórmula
                  </button>
                )}
              </div>
              <dl className="datos-hc datos-hc--diagnostico">
                <Dato etiqueta="Diagnóstico">
                  <strong>{formula.diagnostico}</strong>
                </Dato>
                <Dato etiqueta="Código CIE-10">
                  {formula.cie10 ? <span className="codigo-cie10">{formula.cie10}</span> : "Sin código"}
                </Dato>
              </dl>
              {formula.nota && <blockquote className="nota-medico">“{formula.nota}”</blockquote>}
              <p className="texto-suave">
                Registrada por {formula.registrada_por} el {formatearFechaHora(formula.registrada_en)}
              </p>
            </section>

            <Medicamentos formula={formula} eps={p.eps} />

            {formula.recomendaciones.length > 0 && (
              <section className="card" aria-labelledby="titulo-recomendaciones">
                <h2 className="admin-card__titulo" id="titulo-recomendaciones">
                  Recomendaciones al paciente
                </h2>
                <ul className="lista-hc">
                  {formula.recomendaciones.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="historia-clinica__lado">
            <EntregaEnFarmacia formula={formula} ocupado={ocupado} onDescargar={descargar} onReenviar={reenviar} />
            <QuienHaConsultado accesos={historia.accesos} />
          </div>
        </div>
      ) : (
        <section className="card">
          <h2 className="admin-card__titulo">Fórmula médica</h2>
          <p className="texto-suave">
            Esta consulta todavía no tiene fórmula. Al registrarla, el paciente la ve en Mis citas con las farmacias donde
            reclamar sus medicamentos.
          </p>
          {historia.puede_editar && (
            <div className="acciones-admin">
              <button type="button" className="btn btn--primary" onClick={() => setEditando(true)}>
                Registrar fórmula
              </button>
            </div>
          )}
        </section>
      )}

      {historia.consultas.length > 1 && (
        <section className="card" aria-labelledby="titulo-consultas">
          <h2 className="admin-card__titulo" id="titulo-consultas">
            Consultas del paciente
          </h2>
          <ul className="consultas-hc">
            {historia.consultas.map((c) => (
              <li key={c.cita_id} className={c.cita_id === cita.id ? "is-actual" : ""}>
                {c.cita_id === cita.id ? (
                  <span aria-current="page">
                    <strong>{formatearDiaMes(c.fecha)}</strong> · {c.especialidad} · {c.especialista} (esta consulta)
                  </span>
                ) : (
                  <Link to={`/admin/historia-clinica/${c.cita_id}`}>
                    <strong>{formatearDiaMes(c.fecha)}</strong> · {c.especialidad} · {c.especialista}
                  </Link>
                )}
                <span className={`badge ${CLASE_ESTADO_FORMULA[c.formula_estado]}`}>{c.formula_estado_texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {imprimiendo && formula && <FormulaImpresa formula={formula} qr={historia.qr} paciente={p.nombre} />}
    </>
  );
}
