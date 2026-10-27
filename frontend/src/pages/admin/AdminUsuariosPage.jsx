import { useCallback, useEffect, useState } from "react";
import {
  actualizarUsuario,
  crearUsuario,
  listarEspecialistasAdmin,
  listarRoles,
  listarUsuarios,
} from "../../api/admin";
import { BotonIcono, IconoLlave } from "../../components/admin/IconosAdmin";
import FechaHora from "../../components/FechaHora";
import { usePersonal } from "../../context/personal";
import { iniciales } from "../../utils/avatar";

/**
 * Cuentas del personal (solo administradores). Las cuentas no se borran:
 * se desactivan, para que la auditoría conserve quién hizo cada acción.
 * Una cuenta con el rol Médico es la de un médico de la red: en la
 * historia clínica solo ve a sus pacientes.
 */

const ROLES = [
  ["administrador", "Administrador"],
  ["agendamiento", "Agendamiento"],
  ["call_center", "Call center"],
  ["coordinador_medico", "Coordinación médica"],
  ["medico", "Médico"],
];

const NOMBRE_ROL = Object.fromEntries(ROLES);

// Cada permiso en palabras de quien administra, en el orden de la tabla "¿Qué puede hacer cada rol?".
const QUE_PUEDE = [
  ["ver_citas", "Ver las citas y el historial del paciente"],
  ["observaciones", "Dejar observaciones"],
  ["confirmar_asistencia", "Confirmar asistencia"],
  ["recordatorios", "Recordatorios, mensajes programados y llamadas"],
  ["reprogramar_cancelar", "Reprogramar y cancelar citas"],
  ["lista_espera", "Lista de espera: asignar la cita y retirar"],
  ["asignar_prioridad", "Prioridad médica en la lista de espera"],
  ["revisar_solicitudes", "Revisar y decidir las peticiones"],
  ["registrar_atencion", "Registrar si fue atendido o no asistió"],
  ["historia_clinica", "Historia clínica: diagnósticos y fórmulas"],
  ["ver_reportes", "Resumen y reportes"],
  ["gestionar_especialistas", "Especialistas, sus horarios y la IPS"],
  ["ver_auditoria", "Auditoría"],
  ["seguridad", "Seguridad: accesos, alertas y cerrar sesiones"],
  ["gestionar_usuarios", "Crear y editar cuentas del personal"],
];

/** Mínimo privilegio a la vista: qué permite cada rol, para elegirlo con criterio. */
function TablaRoles({ roles }) {
  return (
    <section className="card" aria-labelledby="titulo-roles">
      <div className="admin-card__cabeza">
        <h2 className="admin-card__titulo" id="titulo-roles">
          ¿Qué puede hacer cada rol?
        </h2>
        <span className="admin-card__dato">Cada rol tiene solo lo que su función necesita.</span>
      </div>
      <div className="tabla-contenedor">
        <table className="tabla tabla-roles">
          <thead>
            <tr>
              <th scope="col">Puede…</th>
              {roles.map((r) => (
                <th scope="col" key={r.rol}>
                  {r.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {QUE_PUEDE.map(([permiso, texto]) => (
              <tr key={permiso}>
                <th scope="row">{texto}</th>
                {roles.map((r) =>
                  r.permisos.includes(permiso) ? (
                    <td key={r.rol}>
                      <span className="tabla-roles__si" aria-hidden="true">
                        ✓
                      </span>
                      <span className="sr-only">Sí</span>
                    </td>
                  ) : (
                    <td key={r.rol}>
                      <span className="tabla-roles__no" aria-hidden="true">
                        —
                      </span>
                      <span className="sr-only">No</span>
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Debe coincidir con MIN_LONGITUD_PASSWORD del backend (personal_service.py).
const MIN_CLAVE = 12;

const NUEVO = { nombre: "", correo: "", rol: "agendamiento", password: "", especialista_id: "" };

/** "¿Qué médico es?": los médicos activos de la red que todavía no tienen cuenta (más el elegido). */
function SelectorMedico({ id, especialistas, valor, onCambiar }) {
  return (
    <select id={id} value={valor} required onChange={(e) => onCambiar(e.target.value)}>
      <option value="">Elija el médico</option>
      {especialistas.map((e) => (
        <option key={e.id} value={e.id}>
          {e.nombre} · {e.especialidad.nombre}
        </option>
      ))}
    </select>
  );
}

/**
 * Cambiar el rol o desactivar una cuenta cambia lo que esa persona puede
 * hacer de inmediato: antes se pregunta, con su nombre y lo que pasará,
 * para que un clic por error no le quite o le dé permisos a nadie.
 */
function confirmacionPara(usuario, cambios) {
  const nombre = usuario.nombre.split(" ")[0];
  if ("rol" in cambios) {
    return {
      pregunta: `¿Desea cambiar el rol de ${usuario.nombre} de ${NOMBRE_ROL[usuario.rol]} a ${NOMBRE_ROL[cambios.rol]}?`,
      detalle:
        cambios.rol === "medico"
          ? "Elija qué médico de la red es: en la historia clínica solo verá a sus pacientes. Su sesión abierta se cierra."
          : "Sus permisos cambian de inmediato y su sesión abierta se cierra.",
      boton: "Sí, cambiar el rol",
      exito: `Rol de ${usuario.nombre} actualizado.`,
    };
  }
  return cambios.activo
    ? {
        pregunta: `¿Desea activar la cuenta de ${usuario.nombre}?`,
        detalle: `${nombre} podrá volver a ingresar con su contraseña.`,
        boton: "Sí, activar",
        exito: `Cuenta de ${usuario.nombre} activada.`,
      }
    : {
        pregunta: `¿Desea desactivar la cuenta de ${usuario.nombre}?`,
        detalle: `${nombre} no podrá volver a ingresar al sistema. Su historial se conserva y la cuenta se puede activar de nuevo cuando lo necesite.`,
        boton: "Sí, desactivar",
        exito: `Cuenta de ${usuario.nombre} desactivada.`,
        peligro: true,
      };
}

export default function AdminUsuariosPage() {
  const { personal: yo } = usePersonal();
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [nuevo, setNuevo] = useState(NUEVO);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [claveDe, setClaveDe] = useState(null); // id del usuario al que se le cambia la contraseña
  const [clave, setClave] = useState("");
  const [porConfirmar, setPorConfirmar] = useState(null); // { usuario, cambios, pregunta, ... }
  const [especialistas, setEspecialistas] = useState([]);

  const cargar = useCallback(
    () =>
      listarUsuarios()
        .then(setUsuarios)
        .catch((err) => setAviso({ tipo: "error", texto: err.message })),
    []
  );

  useEffect(() => {
    cargar();
    // La tabla de roles es informativa: si no carga, simplemente no se muestra.
    listarRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
    listarEspecialistasAdmin()
      .then((lista) => setEspecialistas(lista.filter((e) => e.activo)))
      .catch(() => setEspecialistas([]));
  }, [cargar]);

  // Para el rol Médico: los que todavía no tienen cuenta (un médico, una cuenta).
  const conCuenta = new Set(usuarios.map((u) => u.especialista_id).filter(Boolean));
  const medicosSinCuenta = especialistas.filter((e) => !conCuenta.has(e.id));

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
    const datos = { ...nuevo, especialista_id: nuevo.rol === "medico" ? nuevo.especialista_id : null };
    if (await ejecutar(() => crearUsuario(datos), `Cuenta creada para ${nuevo.nombre}.`)) setNuevo(NUEVO);
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
            Creación de cuentas y asignación de roles. Solo los roles Médico y Coordinación médica pueden ver la historia
            clínica. Al desactivar una cuenta, el acceso se revoca de inmediato.
          </p>
        </div>
      </div>

      {aviso && <div className={`alert alert--${aviso.tipo}`}>{aviso.texto}</div>}

      {porConfirmar && (
        <div
          className={`panel-admin panel-admin--confirmar panel-admin--fila ${porConfirmar.peligro ? "panel-admin--peligro" : ""}`}
          role="alertdialog"
          aria-labelledby="confirmar-cuenta"
        >
          <p id="confirmar-cuenta">
            <strong>{porConfirmar.pregunta}</strong> {porConfirmar.detalle}
          </p>
          {porConfirmar.cambios.rol === "medico" && (
            <div className="field">
              <label htmlFor="medico_de_la_cuenta">¿Qué médico es?</label>
              <SelectorMedico
                id="medico_de_la_cuenta"
                especialistas={medicosSinCuenta}
                valor={porConfirmar.cambios.especialista_id ?? ""}
                onCambiar={(id) => setPorConfirmar({ ...porConfirmar, cambios: { ...porConfirmar.cambios, especialista_id: id } })}
              />
            </div>
          )}
          <div className="acciones-admin">
            <button
              className={`btn ${porConfirmar.peligro ? "btn--peligro" : "btn--primary"}`}
              disabled={ocupado || (porConfirmar.cambios.rol === "medico" && !porConfirmar.cambios.especialista_id)}
              onClick={confirmar}
              // El foco salta aquí: quien cambió el rol ve la pregunta aunque esté más abajo en la tabla.
              autoFocus
            >
              {porConfirmar.boton}
            </button>
            <button className="btn btn--outline btn--texto-peligro" onClick={() => setPorConfirmar(null)}>
              No, volver
            </button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={crear} aria-labelledby="titulo-nueva-cuenta">
        <h2 className="admin-card__titulo" id="titulo-nueva-cuenta">
          Nueva cuenta
        </h2>
        <div className={`nueva-cuenta ${nuevo.rol === "medico" ? "nueva-cuenta--medico" : ""}`}>
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
          {nuevo.rol === "medico" && (
            <div className="field">
              <label htmlFor="medico_nuevo">¿Qué médico es?</label>
              <SelectorMedico
                id="medico_nuevo"
                especialistas={medicosSinCuenta}
                valor={nuevo.especialista_id}
                onCambiar={(id) => setNuevo({ ...nuevo, especialista_id: id })}
              />
            </div>
          )}
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
                      <span className="celda-doble">
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
                        {u.especialista && <span className="celda-doble__dato">{u.especialista}</span>}
                      </span>
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

      {roles.length > 0 && <TablaRoles roles={roles} />}
    </>
  );
}
