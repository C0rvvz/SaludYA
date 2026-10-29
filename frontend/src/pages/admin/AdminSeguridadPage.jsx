import { useCallback, useEffect, useMemo, useState } from "react";
import { cerrarSesionRemota, obtenerSeguridad } from "../../api/admin";
import EncabezadoAuditoriaYSeguridad from "../../components/admin/AuditoriaYSeguridad";
import { IconoBuscar } from "../../components/admin/IconosAdmin";
import { CabezaTarjeta, Cifra } from "../../components/admin/Reportes";
import FechaHora from "../../components/FechaHora";
import { usePersonal } from "../../context/personal";
import { formatearFechaHora } from "../../utils/formato";
import { subirAlInicio } from "../../utils/desplazamiento";

/**
 * Seguridad (pestaña de "Auditoría y seguridad", solo administradores) — monitoreo tipo SIEM / SOC:
 *   - Cifras del periodo: ingresos, intentos fallidos, bloqueos, intentos sin permiso.
 *   - Alertas: las arma el backend con reglas (fuerza bruta, varias cuentas
 *     desde una conexión, tokens alterados...), cada una con qué hacer.
 *   - Sesiones activas: quién está conectado ahora; una sesión que no se
 *     reconoce se cierra a distancia (Zero Trust).
 *   - Eventos: el registro completo, que no se puede modificar ni borrar.
 *   - Controles de seguridad activos.
 * Se actualiza sola cada minuto.
 */

const PERIODOS = [
  [24, "Últimas 24 horas"],
  [168, "Últimos 7 días"],
  [720, "Últimos 30 días"],
];

const DESCRIPCION =
  "Monitoreo de los accesos al sistema. Las alertas se generan solas a partir de reglas; los eventos no pueden modificarse ni eliminarse.";

const SEVERIDAD = {
  alta: ["Alta", "badge--error"],
  media: ["Media", "badge--warning"],
  info: ["Informativa", "badge--neutral"],
};

const GRUPOS_SEVERIDAD = [
  ["alta", "Alta", "var(--color-error)"],
  ["media", "Media", "var(--color-warning-ink)"],
  ["info", "Informativa", "var(--color-line-strong)"],
];

// Qué significa cada nivel, para eventos y alertas (las reglas están en seguridad_service).
const NIVELES = [
  [
    "alta",
    "Puede ser un ataque o un riesgo para una cuenta: muchos intentos fallidos desde una conexión, una cuenta o un código bloqueados, un token alterado o un administrador nuevo. Revísela de inmediato y siga «Qué hacer».",
  ],
  [
    "media",
    "Algo fuera de lo normal que conviene revisar hoy: un intento fallido o sin permiso, un ingreso de madrugada o desde otra conexión, o una conexión frenada por exceso de intentos.",
  ],
  ["info", "Actividad normal que queda registrada, como los ingresos exitosos. No requiere acción."],
];

function Severidad({ valor }) {
  const [texto, clase] = SEVERIDAD[valor] ?? [valor, "badge--neutral"];
  return <span className={`badge ${clase}`}>{texto}</span>;
}

/** Recuadro plegable: no estorba, y quien no sepa qué significa cada nivel lo abre. */
function LeyendaSeveridad() {
  return (
    <details className="leyenda-severidad">
      <summary>¿Qué significan Alta, Media e Informativa?</summary>
      <dl>
        {NIVELES.map(([valor, texto]) => (
          <div key={valor} className="leyenda-severidad__nivel">
            <dt>
              <Severidad valor={valor} />
            </dt>
            <dd>{texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Alertas({ alertas }) {
  if (alertas.length === 0) {
    return <p className="seguridad-vacio">Sin alertas en este periodo.</p>;
  }
  return (
    <>
      <LeyendaSeveridad />
      <ul className="alertas-seguridad">
        {alertas.map((a) => (
          <li key={`${a.clave}-${a.titulo}`} className={`alerta-seguridad alerta-seguridad--${a.severidad}`}>
            <div className="alerta-seguridad__cabeza">
              <Severidad valor={a.severidad} />
              <strong>{a.titulo}</strong>
            </div>
            <p>{a.descripcion}</p>
            <p className="alerta-seguridad__accion">
              <strong>Qué hacer:</strong> {a.recomendacion}
            </p>
            <p className="alerta-seguridad__meta">
              {a.cantidad} {a.cantidad === 1 ? "vez" : "veces"} · última: {formatearFechaHora(a.ultima_vez)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function SesionesActivas({ sesiones, miCorreo, ocupado, onCerrar }) {
  if (sesiones.length === 0) return <p className="seguridad-vacio">No hay nadie conectado en este momento.</p>;
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <thead>
          <tr>
            <th>Persona</th>
            <th>Tipo</th>
            <th>Conexión</th>
            <th>Desde</th>
            <th>Última actividad</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {sesiones.map((s) => {
            const mia = s.tipo === "personal" && s.identificador === miCorreo;
            return (
              <tr key={s.id}>
                <td>
                  <span className="celda-doble">
                    <span className="celda-persona__nombre">{s.nombre}</span>
                    {s.identificador && <span className="celda-doble__dato">{s.identificador}</span>}
                  </span>
                </td>
                <td>{s.tipo === "personal" ? "Personal" : "Paciente"}</td>
                <td>
                  <span className="celda-doble">
                    <span>{s.ip ?? "—"}</span>
                    {s.dispositivo && <span className="celda-doble__dato">{s.dispositivo}</span>}
                  </span>
                </td>
                <td>
                  <FechaHora valor={s.creada_en} />
                </td>
                <td>
                  <FechaHora valor={s.ultima_actividad_en} />
                </td>
                <td>
                  {mia ? (
                    <span className="texto-suave">Su sesión</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--compacto btn--peligro-outline"
                      disabled={ocupado}
                      aria-label={`Cerrar la sesión de ${s.nombre}`}
                      onClick={() => onCerrar(s)}
                    >
                      Cerrar sesión
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Eventos({ eventos }) {
  const [severidad, setSeveridad] = useState("");
  const [tipo, setTipo] = useState("");
  const [texto, setTexto] = useState("");

  const tipos = useMemo(
    () => [...new Map(eventos.map((e) => [e.tipo, e.tipo_texto])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [eventos]
  );
  const visibles = useMemo(() => {
    const buscado = texto.trim().toLowerCase();
    return eventos.filter(
      (e) =>
        (!severidad || e.severidad === severidad) &&
        (!tipo || e.tipo === tipo) &&
        (!buscado ||
          [e.sujeto_nombre, e.identificador, e.ip, e.descripcion, e.detalle]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(buscado)))
    );
  }, [eventos, severidad, tipo, texto]);
  const cuantos = (valor) => eventos.filter((e) => e.severidad === valor).length;

  return (
    <>
      <div className="filtros-admin filtros-admin--seguridad">
        <div className="field">
          <label htmlFor="buscar-evento">Buscar</label>
          <div className="campo-con-icono">
            <IconoBuscar />
            <input
              id="buscar-evento"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej. persona, correo o IP"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="tipo-evento">Evento</label>
          <select id="tipo-evento" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {tipos.map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="chips-estado" role="group" aria-label="Filtrar por severidad">
        <button
          type="button"
          className={`chip-estado ${severidad === "" ? "is-activo" : ""}`}
          aria-pressed={severidad === ""}
          onClick={() => setSeveridad("")}
        >
          Todos <span className="chip-estado__conteo">{eventos.length}</span>
        </button>
        {GRUPOS_SEVERIDAD.map(([valor, nombre, color]) => (
          <button
            key={valor}
            type="button"
            className={`chip-estado ${severidad === valor ? "is-activo" : ""}`}
            aria-pressed={severidad === valor}
            onClick={() => setSeveridad(valor)}
          >
            <span className="chip-estado__punto" style={{ background: color }} aria-hidden="true" />
            {nombre} <span className="chip-estado__conteo">{cuantos(valor)}</span>
          </button>
        ))}
      </div>
      <LeyendaSeveridad />

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Evento</th>
              <th>Persona</th>
              <th>Conexión</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => (
              <tr key={e.id}>
                <td>
                  <FechaHora valor={e.fecha} />
                </td>
                <td>
                  <span className="celda-doble">
                    <Severidad valor={e.severidad} />
                    <span className="celda-persona__nombre">{e.tipo_texto}</span>
                    <span className="celda-doble__dato">
                      {e.ambito === "personal" ? "Panel del personal" : "Portal del paciente"}
                    </span>
                  </span>
                </td>
                <td>
                  <span className="celda-doble">
                    <span>{e.sujeto_nombre ?? "Sin identificar"}</span>
                    {e.identificador && <span className="celda-doble__dato">{e.identificador}</span>}
                  </span>
                </td>
                <td>
                  <span className="celda-doble">
                    <span>{e.ip ?? "—"}</span>
                    {e.dispositivo && <span className="celda-doble__dato">{e.dispositivo}</span>}
                  </span>
                </td>
                <td>
                  <span className="celda-doble">
                    <span>{e.descripcion}</span>
                    {e.detalle && <span className="celda-doble__dato">{e.detalle}</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="tabla-vacia">No hay eventos con esos filtros.</p>}
      </div>
    </>
  );
}

export default function AdminSeguridadPage() {
  const { personal: yo } = usePersonal();
  const [horas, setHoras] = useState(24);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [porCerrar, setPorCerrar] = useState(null); // la sesión que se va a cerrar (confirmación)

  const cargar = useCallback(
    () =>
      obtenerSeguridad(horas)
        .then((d) => {
          setDatos(d);
          setError("");
        })
        .catch((err) => setError(err.message)),
    [horas]
  );

  // Como un SOC: se refresca solo cada minuto.
  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 60000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  async function cerrar() {
    const sesion = porCerrar;
    setPorCerrar(null);
    setOcupado(true);
    setAviso("");
    try {
      await cerrarSesionRemota(sesion.id);
      setAviso(`Se cerró la sesión de ${sesion.nombre}. Tendrá que volver a ingresar.`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  const i = datos?.indicadores;

  return (
    <>
      <EncabezadoAuditoriaYSeguridad descripcion={DESCRIPCION}>
        <div className="selector-periodo">
          <label htmlFor="periodo-seguridad">Periodo</label>
          <select id="periodo-seguridad" value={horas} onChange={(e) => setHoras(Number(e.target.value))}>
            {PERIODOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
      </EncabezadoAuditoriaYSeguridad>

      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {porCerrar && (
        <div
          className="panel-admin panel-admin--confirmar panel-admin--fila panel-admin--peligro"
          role="alertdialog"
          aria-labelledby="confirmar-cierre"
        >
          <p id="confirmar-cierre">
            <strong>¿Desea cerrar la sesión de {porCerrar.nombre}?</strong> Tendrá que volver a ingresar. Úselo si no
            reconoce la conexión ({porCerrar.ip ?? "desconocida"}
            {porCerrar.dispositivo ? `, ${porCerrar.dispositivo}` : ""}).
          </p>
          <div className="acciones-admin">
            <button className="btn btn--peligro" onClick={cerrar} autoFocus>
              Sí, cerrar la sesión
            </button>
            <button className="btn btn--outline btn--texto-peligro" onClick={() => setPorCerrar(null)}>
              No, volver
            </button>
          </div>
        </div>
      )}

      {datos && (
        <div className="reporte">
          <section className="card" aria-labelledby="seguridad-resumen">
            <CabezaTarjeta
              id="seguridad-resumen"
              titulo="Resumen del periodo"
              dato={PERIODOS.find(([valor]) => valor === horas)?.[1]}
            />
            <div className="cifras">
              <Cifra valor={i.ingresos_exitosos} nombre="Ingresos exitosos" tono="exito" />
              <Cifra valor={i.ingresos_fallidos} nombre="Intentos fallidos" tono={i.ingresos_fallidos ? "aviso" : null} />
              <Cifra valor={i.bloqueos} nombre="Cuentas o códigos bloqueados" tono={i.bloqueos ? "peligro" : null} />
              <Cifra
                valor={i.accesos_denegados}
                nombre="Intentos sin permiso"
                detalle="O con un token inválido"
                tono={i.accesos_denegados ? "peligro" : null}
              />
              <Cifra valor={i.sesiones_activas} nombre="Conectados ahora" />
            </div>
          </section>

          <section className="card" aria-labelledby="seguridad-alertas">
            <CabezaTarjeta
              id="seguridad-alertas"
              titulo="Alertas"
              dato={i.alertas_altas ? `${i.alertas_altas} de severidad alta` : "Ninguna de severidad alta"}
            />
            <Alertas alertas={datos.alertas} />
          </section>

          <section className="card" aria-labelledby="seguridad-sesiones">
            <CabezaTarjeta id="seguridad-sesiones" titulo="Sesiones activas" dato="Con actividad en los últimos minutos" />
            <SesionesActivas
              sesiones={datos.sesiones_activas}
              miCorreo={yo.correo}
              ocupado={ocupado}
              onCerrar={(s) => {
                setAviso("");
                setPorCerrar(s);
                subirAlInicio();
              }}
            />
          </section>

          <section className="card" aria-labelledby="seguridad-eventos">
            <CabezaTarjeta id="seguridad-eventos" titulo="Eventos de seguridad" dato="Los más recientes primero" />
            <Eventos eventos={datos.eventos} />
          </section>

          <section className="card" aria-labelledby="seguridad-controles">
            <CabezaTarjeta id="seguridad-controles" titulo="Controles de seguridad activos" dato="Zero Trust" />
            <ul className="controles-seguridad">
              {datos.controles.map((c) => (
                <li key={c.nombre}>
                  <span className="controles-seguridad__marca" aria-hidden="true">
                    ✓
                  </span>
                  <span className="celda-doble">
                    <strong>{c.nombre}</strong>
                    <span className="celda-doble__dato">{c.detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
