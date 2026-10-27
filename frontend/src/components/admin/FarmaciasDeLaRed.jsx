import { useCallback, useEffect, useState } from "react";
import { cambiarEstadoFarmacia, crearFarmacia, editarFarmacia, listarFarmaciasAdmin } from "../../api/admin";
import { BotonIcono, IconoEditar } from "./IconosAdmin";
import { CabezaTarjeta } from "./Reportes";

/**
 * Farmacias donde los pacientes reclaman su fórmula médica, dentro de
 * "Especialistas" (después de las sedes): agregarlas, editarlas y cerrarlas
 * o volver a abrirlas.
 *
 * Cada una está cerca de una sede, a cierta distancia: el paciente ve
 * primero las cercanas a donde lo atendieron. Las aliadas entregan gratis
 * con el código de la fórmula. Con la dirección, "Cómo llegar" lleva a la
 * puerta; sin ella, al barrio. Una farmacia cerrada ya no se le muestra
 * al paciente.
 *
 * `sedes`: las abiertas (las que se pueden elegir). Cuando cambian, la
 * lista se vuelve a cargar (p. ej. si se renombró una sede).
 */

const km = (distancia) => `${distancia.toLocaleString("es-CO", { maximumFractionDigits: 1 })} km`;

function FormularioFarmacia({ farmacia, sedes, ocupado, onGuardar, onVolver }) {
  const [datos, setDatos] = useState(
    farmacia
      ? {
          nombre: farmacia.nombre,
          barrio: farmacia.barrio,
          ciudad: farmacia.ciudad,
          direccion: farmacia.direccion ?? "",
          sede_id: farmacia.sede_id ?? "",
          distancia_km: String(farmacia.distancia_km),
          aliada: farmacia.aliada,
        }
      : { nombre: "", barrio: "", ciudad: "", direccion: "", sede_id: "", distancia_km: "", aliada: true }
  );
  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value });
  // Si su sede se cerró, puede quedarse con ella (aparece como "cerrada").
  const sedeCerrada = farmacia?.sede_id && !sedes.some((s) => s.id === farmacia.sede_id);

  return (
    <form
      className="formulario-admin formulario-sede"
      aria-label={farmacia ? `Editar ${farmacia.nombre}` : "Nueva farmacia"}
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({
          ...datos,
          direccion: datos.direccion.trim() || null,
          distancia_km: Number(datos.distancia_km),
        });
      }}
    >
      <div className="campos-admin campos-admin--tres">
        <div className="field">
          <label htmlFor="farmacia-nombre">Nombre</label>
          <input
            id="farmacia-nombre"
            value={datos.nombre}
            onChange={cambiar("nombre")}
            placeholder="Ej. Droguería Central"
            required
            minLength={3}
            maxLength={100}
          />
        </div>
        <div className="field">
          <label htmlFor="farmacia-barrio">Barrio</label>
          <input
            id="farmacia-barrio"
            value={datos.barrio}
            onChange={cambiar("barrio")}
            placeholder="Ej. Laureles"
            required
            minLength={2}
            maxLength={100}
          />
        </div>
        <div className="field">
          <label htmlFor="farmacia-ciudad">Ciudad</label>
          <input
            id="farmacia-ciudad"
            value={datos.ciudad}
            onChange={cambiar("ciudad")}
            placeholder="Ej. Medellín"
            required
            minLength={2}
            maxLength={80}
          />
        </div>
        <div className="field">
          <label htmlFor="farmacia-direccion">Dirección <span className="opcional">(opcional)</span></label>
          <input
            id="farmacia-direccion"
            value={datos.direccion}
            onChange={cambiar("direccion")}
            placeholder="Ej. Cra. 76 # 33-10"
            maxLength={150}
          />
        </div>
        <div className="field">
          <label htmlFor="farmacia-sede">Sede cercana</label>
          <select id="farmacia-sede" value={datos.sede_id} onChange={cambiar("sede_id")} required>
            <option value="">Elija una sede</option>
            {sedeCerrada && <option value={farmacia.sede_id}>{farmacia.sede} (cerrada)</option>}
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="farmacia-distancia">Distancia a la sede (km)</label>
          <input
            id="farmacia-distancia"
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            value={datos.distancia_km}
            onChange={cambiar("distancia_km")}
            placeholder="Ej. 0,8"
            required
          />
        </div>
      </div>
      <label className="opcion-admin opcion-admin--casilla">
        <input
          type="checkbox"
          checked={datos.aliada}
          onChange={(e) => setDatos({ ...datos, aliada: e.target.checked })}
        />
        <span className="opcion-admin__titulo">Aliada: entrega gratis los medicamentos con el código de la fórmula</span>
      </label>
      <div className="acciones-admin">
        <button className="btn btn--primary" type="submit" disabled={ocupado}>
          Guardar farmacia
        </button>
        <button className="btn btn--outline btn--texto-peligro" type="button" onClick={onVolver}>
          No, volver
        </button>
      </div>
    </form>
  );
}

export default function FarmaciasDeLaRed({ sedes }) {
  const [farmacias, setFarmacias] = useState(null);
  const [panel, setPanel] = useState(null); // { tipo: "nueva" | "editar" | "estado", farmacia }
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(
    () =>
      listarFarmaciasAdmin()
        .then(setFarmacias)
        .catch((err) => setError(err.message)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar, sedes]);

  async function ejecutar(accion, mensaje) {
    setOcupado(true);
    setAviso("");
    setError("");
    try {
      const farmacia = await accion();
      setAviso(mensaje(farmacia));
      setPanel(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  const abrir = (tipo, farmacia = null) => {
    setAviso("");
    setError("");
    setPanel({ tipo, farmacia });
  };

  const f = panel?.farmacia;

  return (
    <section className="card" aria-labelledby="titulo-farmacias">
      <CabezaTarjeta
        id="titulo-farmacias"
        titulo="Farmacias de la red"
        dato={
          <span className="admin-card__extra">
            <span className="admin-card__dato">Donde se reclaman las fórmulas</span>
            <button
              type="button"
              className="btn btn--outline btn--compacto"
              disabled={ocupado}
              onClick={() => abrir("nueva")}
            >
              Agregar farmacia
            </button>
          </span>
        }
      />
      <p className="texto-suave">
        El paciente ve primero las cercanas a la sede donde lo atendieron. En las aliadas recibe gratis sus
        medicamentos mostrando el código de su fórmula.
      </p>
      {aviso && <div className="alert alert--success">{aviso}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      {panel?.tipo === "nueva" && (
        <FormularioFarmacia
          sedes={sedes}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onGuardar={(datos) => ejecutar(() => crearFarmacia(datos), (r) => `Se agregó ${r.nombre}.`)}
        />
      )}
      {panel?.tipo === "editar" && (
        <FormularioFarmacia
          key={f.id}
          farmacia={f}
          sedes={sedes}
          ocupado={ocupado}
          onVolver={() => setPanel(null)}
          onGuardar={(datos) => ejecutar(() => editarFarmacia(f.id, datos), (r) => `${r.nombre} actualizada.`)}
        />
      )}
      {panel?.tipo === "estado" && (
        <div
          className={`panel-admin panel-admin--confirmar panel-admin--fila ${f.activa ? "panel-admin--peligro" : ""}`}
          role="alertdialog"
          aria-labelledby="confirmar-farmacia"
        >
          <p id="confirmar-farmacia">
            {f.activa ? (
              <>
                <strong>¿Desea cerrar {f.nombre}?</strong> Los pacientes ya no la verán entre las farmacias donde
                reclamar su fórmula.
              </>
            ) : (
              <>
                <strong>¿Desea abrir de nuevo {f.nombre}?</strong> Los pacientes la verán otra vez donde reclamar su
                fórmula.
              </>
            )}
          </p>
          <div className="acciones-admin">
            <button
              className={`btn ${f.activa ? "btn--peligro" : "btn--success"}`}
              disabled={ocupado}
              autoFocus
              onClick={() =>
                ejecutar(
                  () => cambiarEstadoFarmacia(f.id, !f.activa),
                  (r) => `${r.nombre} quedó ${r.activa ? "abierta" : "cerrada"}.`
                )
              }
            >
              {f.activa ? "Sí, cerrar la farmacia" : "Sí, abrirla"}
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
              <th>Farmacia</th>
              <th>Dirección</th>
              <th>Cerca de</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(farmacias ?? []).map((x) => (
              <tr key={x.id}>
                <td>
                  <span className="celda-doble">
                    <span className="celda-persona__nombre">{x.nombre}</span>
                    <span className="celda-doble__dato">
                      {x.barrio}, {x.ciudad}
                    </span>
                  </span>
                </td>
                <td>{x.direccion ?? <span className="texto-suave">Solo el barrio</span>}</td>
                <td>
                  {x.sede ? (
                    <span className="celda-doble">
                      <span>{x.sede}</span>
                      <span className="celda-doble__dato">a {km(x.distancia_km)}</span>
                    </span>
                  ) : (
                    <span className="texto-suave">Sin sede</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${x.aliada ? "badge--success" : "badge--neutral"}`}>
                    {x.aliada ? "Aliada · entrega gratis" : "No aliada"}
                  </span>
                </td>
                <td>
                  <span className={`badge ${x.activa ? "badge--success" : "badge--neutral"}`}>
                    {x.activa ? "Abierta" : "Cerrada"}
                  </span>
                </td>
                <td>
                  <div className="acciones-tabla">
                    <BotonIcono nombre={`Editar ${x.nombre}`} disabled={ocupado} onClick={() => abrir("editar", x)}>
                      <IconoEditar />
                    </BotonIcono>
                    <button
                      type="button"
                      className={`btn btn--compacto ${x.activa ? "btn--peligro-outline" : "btn--outline"}`}
                      disabled={ocupado}
                      aria-label={`${x.activa ? "Cerrar" : "Abrir"} ${x.nombre}`}
                      onClick={() => abrir("estado", x)}
                    >
                      {x.activa ? "Cerrar" : "Abrir"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {farmacias?.length === 0 && <p className="tabla-vacia">Todavía no hay farmacias.</p>}
      </div>
    </section>
  );
}
