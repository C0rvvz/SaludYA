import { useCallback, useEffect, useState } from "react";
import { actualizarUsuario, crearUsuario, listarUsuarios } from "../../api/admin";
import { usePersonal } from "../../context/personal";
import { formatearFechaHora } from "../../utils/formato";

/**
 * Cuentas del personal (solo administradores). Las cuentas no se borran:
 * se desactivan, para que la auditoría conserve quién hizo cada acción.
 */

const ROLES = [
  ["administrador", "Administrador"],
  ["agendamiento", "Agendamiento"],
  ["call_center", "Call center"],
  ["coordinador_medico", "Coordinador médico"],
];

const NUEVO = { nombre: "", correo: "", rol: "agendamiento", password: "" };

export default function AdminUsuariosPage() {
  const { personal: yo } = usePersonal();
  const [usuarios, setUsuarios] = useState([]);
  const [nuevo, setNuevo] = useState(NUEVO);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [claveDe, setClaveDe] = useState(null); // id del usuario al que se le cambia la contraseña
  const [clave, setClave] = useState("");

  const cargar = useCallback(
    () =>
      listarUsuarios()
        .then(setUsuarios)
        .catch((err) => setAviso({ tipo: "error", texto: err.message })),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(accion, texto) {
    setOcupado(true);
    setAviso(null);
    try {
      await accion();
      setAviso({ tipo: "success", texto });
      await cargar();
      return true;
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function crear(evento) {
    evento.preventDefault();
    if (await ejecutar(() => crearUsuario(nuevo), `Cuenta creada para ${nuevo.nombre}.`)) setNuevo(NUEVO);
  }

  async function cambiarClave(usuario) {
    if (await ejecutar(() => actualizarUsuario(usuario.id, { password: clave }), `Contraseña de ${usuario.nombre} actualizada.`)) {
      setClaveDe(null);
      setClave("");
    }
  }

  return (
    <>
      <h1 className="admin-titulo">Usuarios del personal</h1>
      <p className="admin-subtitulo">
        Cree las cuentas del personal y asigne su rol. Una cuenta desactivada pierde el acceso de inmediato.
      </p>

      {aviso && <div className={`alert alert--${aviso.tipo}`}>{aviso.texto}</div>}

      <form className="filters-card filtros-admin" onSubmit={crear}>
        <div className="field">
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="correo_nuevo">Correo institucional</label>
          <input
            id="correo_nuevo"
            type="email"
            value={nuevo.correo}
            onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="rol">Rol</label>
          <select id="rol" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
            {ROLES.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="clave_nueva">Contraseña inicial (mín. 10 caracteres)</label>
          <input
            id="clave_nueva"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={nuevo.password}
            onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
            required
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={ocupado}>
          Crear cuenta
        </button>
      </form>

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último acceso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.nombre}</strong>
                  <span className="texto-suave">{u.correo}</span>
                </td>
                <td>
                  <select
                    aria-label={`Rol de ${u.nombre}`}
                    value={u.rol}
                    disabled={ocupado || u.id === yo.id}
                    onChange={(e) => ejecutar(() => actualizarUsuario(u.id, { rol: e.target.value }), `Rol de ${u.nombre} actualizado.`)}
                  >
                    {ROLES.map(([valor, texto]) => (
                      <option key={valor} value={valor}>
                        {texto}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`badge ${u.activo ? "badge--success" : "badge--neutral"}`}>
                    {u.activo ? "Activa" : "Desactivada"}
                  </span>
                </td>
                <td>{u.ultimo_acceso_en ? formatearFechaHora(u.ultimo_acceso_en) : "Nunca"}</td>
                <td>
                  <div className="acciones-tabla">
                    {u.id !== yo.id && (
                      <button
                        className={`btn btn--compacto ${u.activo ? "btn--peligro-outline" : "btn--outline"}`}
                        disabled={ocupado}
                        onClick={() =>
                          ejecutar(
                            () => actualizarUsuario(u.id, { activo: !u.activo }),
                            `Cuenta de ${u.nombre} ${u.activo ? "desactivada" : "activada"}.`
                          )
                        }
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    )}
                    {claveDe === u.id ? (
                      <>
                        <input
                          type="password"
                          aria-label={`Nueva contraseña de ${u.nombre}`}
                          placeholder="Nueva contraseña"
                          autoComplete="new-password"
                          minLength={10}
                          value={clave}
                          onChange={(e) => setClave(e.target.value)}
                        />
                        <button className="btn btn--primary btn--compacto" disabled={ocupado || clave.length < 10} onClick={() => cambiarClave(u)}>
                          Guardar
                        </button>
                        <button className="btn btn--outline btn--compacto" onClick={() => setClaveDe(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn--outline btn--compacto"
                        onClick={() => {
                          setClaveDe(u.id);
                          setClave("");
                        }}
                      >
                        Cambiar contraseña
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
