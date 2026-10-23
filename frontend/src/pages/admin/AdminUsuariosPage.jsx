import { useCallback, useEffect, useState } from "react";
import { actualizarUsuario, crearUsuario, listarUsuarios } from "../../api/admin";
import { BotonIcono, IconoLlave } from "../../components/admin/IconosAdmin";
import FechaHora from "../../components/FechaHora";
import { usePersonal } from "../../context/personal";
import { iniciales } from "../../utils/avatar";

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

const NOMBRE_ROL = Object.fromEntries(ROLES);

// Debe coincidir con MIN_LONGITUD_PASSWORD del backend (personal_service.py).
const MIN_CLAVE = 12;

const NUEVO = { nombre: "", correo: "", rol: "agendamiento", password: "" };

/**
 * Cambiar el rol o desactivar una cuenta cambia lo que esa persona puede
 * hacer de inmediato: antes se pregunta, con el nombre y el correo, para
 * que un clic por error no le quite o le dé permisos a nadie.
 */
function confirmacionPara(usuario, cambios) {
  const quien = `${usuario.nombre} (${usuario.correo})`;
  if ("rol" in cambios) {
    return {
      pregunta: `¿Cambiar el rol de ${quien} de ${NOMBRE_ROL[usuario.rol]} a ${NOMBRE_ROL[cambios.rol]}?`,
      detalle: "Sus permisos cambian de inmediato y su sesión abierta se cierra.",
      boton: "Sí, cambiar el rol",
      exito: `Rol de ${usuario.nombre} actualizado.`,
    };
  }
  return cambios.activo
    ? {
        pregunta: `¿Activar la cuenta de ${quien}?`,
        detalle: "Podrá volver a ingresar con su contraseña.",
        boton: "Sí, activar",
        exito: `Cuenta de ${usuario.nombre} activada.`,
      }
    : {
        pregunta: `¿Desactivar la cuenta de ${quien}?`,
        detalle: "El acceso se revocará de inmediato. La cuenta se conserva para efectos de auditoría.",
        boton: "Sí, desactivar",
        exito: `Cuenta de ${usuario.nombre} desactivada.`,
        peligro: true,
      };
}

export default function AdminUsuariosPage() {
  const { personal: yo } = usePersonal();
  const [usuarios, setUsuarios] = useState([]);
  const [nuevo, setNuevo] = useState(NUEVO);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [claveDe, setClaveDe] = useState(null); // id del usuario al que se le cambia la contraseña
  const [clave, setClave] = useState("");
  const [porConfirmar, setPorConfirmar] = useState(null); // { usuario, cambios, pregunta, ... }

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

  function pedirConfirmacion(usuario, cambios) {
    setAviso(null);
    setPorConfirmar({ usuario, cambios, ...confirmacionPara(usuario, cambios) });
  }

  async function confirmar() {
    const { usuario, cambios, exito } = porConfirmar;
    setPorConfirmar(null);
    await ejecutar(() => actualizarUsuario(usuario.id, cambios), exito);
  }

  async function cambiarClave(usuario) {
    if (await ejecutar(() => actualizarUsuario(usuario.id, { password: clave }), `Contraseña de ${usuario.nombre} actualizada.`)) {
      setClaveDe(null);
      setClave("");
    }
  }

  return (
    <>
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Usuarios del personal</h1>
          <p className="admin-subtitulo">
            Creación de cuentas y asignación de roles. Al desactivar una cuenta, el acceso se revoca de inmediato.
          </p>
        </div>
      </div>

      {aviso && <div className={`alert alert--${aviso.tipo}`}>{aviso.texto}</div>}

      {porConfirmar && (
        <div
          className={`panel-admin panel-admin--confirmar ${porConfirmar.peligro ? "panel-admin--peligro" : ""}`}
          role="alertdialog"
          aria-labelledby="confirmar-cuenta"
        >
          <p id="confirmar-cuenta">
            <strong>{porConfirmar.pregunta}</strong> {porConfirmar.detalle}
          </p>
          <div className="acciones-admin">
            <button
              className={`btn ${porConfirmar.peligro ? "btn--peligro" : "btn--primary"}`}
              disabled={ocupado}
              onClick={confirmar}
              // El foco salta aquí: quien cambió el rol ve la pregunta aunque esté más abajo en la tabla.
              autoFocus
            >
              {porConfirmar.boton}
            </button>
            <button className="btn btn--outline" onClick={() => setPorConfirmar(null)}>
              No, volver
            </button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={crear} aria-labelledby="titulo-nueva-cuenta">
        <h2 className="admin-card__titulo" id="titulo-nueva-cuenta">
          Nueva cuenta
        </h2>
        <div className="nueva-cuenta">
          <div className="field">
            <label htmlFor="nombre">Nombre completo</label>
            <input
              id="nombre"
              value={nuevo.nombre}
              placeholder="Ej. Juliana Restrepo"
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="correo_nuevo">Correo institucional</label>
            <input
              id="correo_nuevo"
              type="email"
              value={nuevo.correo}
              placeholder="Ej. nombre@clinica.co"
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
            <label htmlFor="clave_nueva">Contraseña inicial</label>
            <input
              id="clave_nueva"
              type="password"
              autoComplete="new-password"
              minLength={MIN_CLAVE}
              placeholder={`Mínimo ${MIN_CLAVE} caracteres`}
              value={nuevo.password}
              onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
              required
            />
          </div>
          <button className="btn btn--primary" type="submit" disabled={ocupado}>
            Crear cuenta
          </button>
        </div>
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
            {usuarios.map((u) => {
              const esYo = u.id === yo.id;
              return (
                <tr key={u.id}>
                  <td>
                    <span className="celda-persona">
                      <span className="celda-persona__iniciales" aria-hidden="true">
                        {iniciales(u.nombre)}
                      </span>
                      <span className="celda-persona__textos">
                        <span className="celda-persona__nombre">{u.nombre}</span>
                        <span className="celda-persona__dato">{u.correo}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    {esYo ? (
                      // Nadie cambia su propio rol: lo hace otra persona administradora.
                      <span className="celda-doble">
                        <span>{NOMBRE_ROL[u.rol]}</span>
                        <span className="celda-doble__dato">Su cuenta</span>
                      </span>
                    ) : (
                      <select
                        aria-label={`Rol de ${u.nombre}`}
                        value={u.rol}
                        disabled={ocupado}
                        onChange={(e) => pedirConfirmacion(u, { rol: e.target.value })}
                      >
                        {ROLES.map(([valor, texto]) => (
                          <option key={valor} value={valor}>
                            {texto}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.activo ? "badge--success" : "badge--neutral"}`}>
                      {u.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td>{u.ultimo_acceso_en ? <FechaHora valor={u.ultimo_acceso_en} /> : "Sin accesos"}</td>
                  <td>
                    {claveDe === u.id ? (
                      <div className="acciones-tabla">
                        <input
                          type="password"
                          aria-label={`Nueva contraseña de ${u.nombre}`}
                          placeholder={`Mínimo ${MIN_CLAVE} caracteres`}
                          autoComplete="new-password"
                          minLength={MIN_CLAVE}
                          value={clave}
                          onChange={(e) => setClave(e.target.value)}
                        />
                        <button
                          className="btn btn--primary btn--compacto"
                          disabled={ocupado || clave.length < MIN_CLAVE}
                          onClick={() => cambiarClave(u)}
                        >
                          Guardar
                        </button>
                        <button className="btn btn--outline btn--compacto" onClick={() => setClaveDe(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="acciones-tabla">
                        <BotonIcono
                          nombre={`Cambiar la contraseña de ${u.nombre}`}
                          onClick={() => {
                            setClaveDe(u.id);
                            setClave("");
                          }}
                        >
                          <IconoLlave />
                        </BotonIcono>
                        {!esYo && (
                          <button
                            className={`btn btn--compacto ${u.activo ? "btn--peligro-outline" : "btn--outline"}`}
                            disabled={ocupado}
                            aria-label={`${u.activo ? "Desactivar" : "Activar"} la cuenta de ${u.nombre}`}
                            onClick={() => pedirConfirmacion(u, { activo: !u.activo })}
                          >
                            {u.activo ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
