import { useCallback, useEffect, useState } from "react";
import { cambiarEstadoSede, crearSede, editarSede, listarSedesAdmin } from "../../api/admin";
import { BotonIcono, IconoEditar } from "./IconosAdmin";
import { CabezaTarjeta } from "./Reportes";

/**
 * Sedes de la red (RF-89), dentro de "Especialistas": agregarlas,
 * editarlas (nombre, ciudad y dirección para "Cómo llegar") y cerrarlas o
 * volver a abrirlas. Una sede no se cierra mientras alguien tenga turnos
 * en ella (el backend dice a quién cambiarle el horario). `onCambio` avisa
 * a la página para que el editor de turnos use las sedes al día.
 */

const VACIA = { nombre: "", ciudad: "", direccion: "" };

// "4 abiertas", "1 abierta"
function abiertas(sedes) {
  const n = sedes.filter((s) => s.activa).length;
  return `${n} ${n === 1 ? "abierta" : "abiertas"}`;
}

function FormularioSede({ sede, ocupado, onGuardar, onVolver }) {
  const [datos, setDatos] = useState(
    sede ? { nombre: sede.nombre, ciudad: sede.ciudad, direccion: sede.direccion ?? "" } : VACIA
  );
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });
  return (
    <form
      className="formulario-admin formulario-sede"
      aria-label={sede ? `Editar ${sede.nombre}` : "Nueva sede"}
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ ...datos, direccion: datos.direccion.trim() || null });
      }}
    >
      <div className="campos-admin campos-admin--tres">
        <div className="field">
          <label htmlFor="sede-nombre">Nombre</label>
          <input
            id="sede-nombre"
            value={datos.nombre}
            onChange={cambiar("nombre")}
            placeholder="Ej. Sede Bello"
            required
            minLength={3}
          />
        </div>
        <div className="field">
          <label htmlFor="sede-ciudad">Ciudad</label>
          <input
            id="sede-ciudad"
            value={datos.ciudad}
            onChange={cambiar("ciudad")}
            placeholder="Ej. Bello"
            required
            minLength={2}
          />
        </div>
        <div className="field">
          <label htmlFor="sede-direccion">Dirección <span className="opcional">(opcional)</span></label>
          <input
            id="sede-direccion"
            value={datos.direccion}
            onChange={cambiar("direccion")}
            placeholder="Ej. Cl. 50 # 49-20"
            maxLength={150}
          />
        </div>
      </div>
      <div className="acciones-admin">
        <button className="btn btn--primary" type="submit" disabled={ocupado}>
          Guardar sede
        </button>
        <button className="btn btn--outline btn--texto-peligro" type="button" onClick={onVolver}>
          No, volver
        </button>
      </div>
    </form>
  );
}

export default function SedesDeLaRed({ onCambio }) {
  const [sedes, setSedes] = useState(null);
  const [panel, setPanel] = useState(null); // { tipo: "nueva" | "editar" | "estado", sede }
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(
    () =>
      listarSedesAdmin()
        .then(setSedes)
        .catch((err) => setError(err.message)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(accion, mensaje) {
    setOcupado(true);
    setAviso("");
    setError("");
    try {
      const sede = await accion();
      setAviso(mensaje(sede));
      setPanel(null);
      await cargar();
      onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  const abrir = (tipo, sede = null) => {
    setAviso("");
    setError("");
    setPanel({ tipo, sede });
  };

  return (
    <section className="card" aria-labelledby="titulo-sedes">
      <CabezaTarjeta
        id="titulo-sedes"
        titulo="Sedes de la red"
        dato={
          <span className="admin-card__extra">
            {sedes && <span className="admin-card__dato">{abiertas(sedes)}</span>}
            <button
              type="button"
              className="btn btn--outline btn--compacto"
              disabled={ocupado}
              onClick={() => abrir("nueva")}
            >
              Agregar sede
            </button>
          </span>
        }
      />
      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {panel?.tipo === "nueva" && (
        <FormularioSede
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onGuardar={(datos) => ejecutar(() => crearSede(datos), (s) => `Se agregó ${s.nombre}.`)}
        />
      )}
      {panel?.tipo === "editar" && (
        <FormularioSede
          key={panel.sede.id}
          sede={panel.sede}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onGuardar={(datos) => ejecutar(() => editarSede(panel.sede.id, datos), (s) => `${s.nombre} actualizada.`)}
        />
      )}
      {panel?.tipo === "estado" && (
        <div
          className={`panel-admin panel-admin--confirmar panel-admin--fila ${panel.sede.activa ? "panel-admin--peligro" : ""}`}
          role="alertdialog"
          aria-labelledby="confirmar-sede"
        >
          <p id="confirmar-sede">
            {panel.sede.activa ? (
              <>
                <strong>¿Desea cerrar {panel.sede.nombre}?</strong> Ya no se ofrecerá ni se podrá usar en un horario.{" "}
                {panel.sede.citas_proximas
                  ? `Sus ${panel.sede.citas_proximas} citas ya agendadas se conservan.`
                  : "No tiene citas próximas."}
              </>
            ) : (
              <>
                <strong>¿Desea abrir de nuevo {panel.sede.nombre}?</strong> Se podrá usar otra vez en los horarios.
              </>
            )}
          </p>
          <div className="acciones-admin">
            <button
              className={`btn ${panel.sede.activa ? "btn--peligro" : "btn--success"}`}
              disabled={ocupado}
              autoFocus
              onClick={() =>
                ejecutar(
                  () => cambiarEstadoSede(panel.sede.id, !panel.sede.activa),
                  (s) => `${s.nombre} quedó ${s.activa ? "abierta" : "cerrada"}.`
                )
              }
            >
              {panel.sede.activa ? "Sí, cerrar la sede" : "Sí, abrirla"}
            </button>
            <button className="btn btn--outline btn--texto-peligro" onClick={() => setPanel(null)}>
              No, volver
            </button>
          </div>
        </div>
      )}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Dirección</th>
              <th>Quién atiende</th>
              <th>Citas próximas</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(sedes ?? []).map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="celda-doble">
                    <span className="celda-persona__nombre">{s.nombre}</span>
                    <span className="celda-doble__dato">{s.ciudad}</span>
                  </span>
                </td>
                <td>{s.direccion ?? <span className="texto-suave">Sin dirección</span>}</td>
                <td>
                  {s.especialistas.length ? (
                    <span className="celda-doble">
                      <span>
                        {s.especialistas.length} {s.especialistas.length === 1 ? "especialista" : "especialistas"}
                      </span>
                      <span className="celda-doble__dato">{s.especialistas.join(", ")}</span>
                    </span>
                  ) : (
                    <span className="texto-suave">Nadie todavía</span>
                  )}
                </td>
                <td>{s.citas_proximas}</td>
                <td>
                  <span className={`badge ${s.activa ? "badge--success" : "badge--neutral"}`}>
                    {s.activa ? "Abierta" : "Cerrada"}
                  </span>
                </td>
                <td>
                  <div className="acciones-tabla">
                    <BotonIcono nombre={`Editar ${s.nombre}`} disabled={ocupado} onClick={() => abrir("editar", s)}>
                      <IconoEditar />
                    </BotonIcono>
                    <button
                      type="button"
                      className={`btn btn--compacto ${s.activa ? "btn--peligro-outline" : "btn--outline"}`}
                      disabled={ocupado}
                      aria-label={`${s.activa ? "Cerrar" : "Abrir"} ${s.nombre}`}
                      onClick={() => abrir("estado", s)}
                    >
                      {s.activa ? "Cerrar" : "Abrir"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
