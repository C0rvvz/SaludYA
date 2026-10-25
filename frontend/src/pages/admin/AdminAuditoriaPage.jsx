import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listarAuditoria } from "../../api/admin";
import { IconoBuscar } from "../../components/admin/IconosAdmin";
import FechaHora from "../../components/FechaHora";

/**
 * Auditoría — HU-80 a HU-85: qué acción se hizo (HU-82), quién la hizo
 * (HU-81), sobre qué cita (HU-84), el estado antes y después (HU-83),
 * en orden cronológico (HU-80) y completo por cita (HU-85, al filtrar).
 * También los cambios a las cuentas del personal: quién (nombre, rol y
 * correo) creó, desactivó o cambió el rol de qué cuenta, y cuándo.
 */

const ACCIONES_CITAS = {
  agendar: "Agendar",
  confirmar_asistencia: "Confirmar asistencia",
  registrar_llegada: "Registrar llegada",
  recordatorio: "Recordatorio",
  recordatorio_fallido: "Recordatorio fallido",
  unirse_lista_espera: "Unirse a la lista de espera",
  ofrecer_cupo: "Ofrecer cupo (lista de espera)",
  rechazar_cupo: "Rechazar cupo (lista de espera)",
  vencer_cupo: "Cupo vencido (lista de espera)",
  salir_lista_espera: "Salir de la lista de espera",
  prioridad_lista_espera: "Prioridad (lista de espera)",
  radicar_solicitud: "Radicar solicitud",
  aprobar_solicitud: "Aprobar solicitud",
  enviar_eps_solicitud: "Enviar solicitud a la EPS",
  negar_solicitud: "No aprobar solicitud",
  programar_recordatorio: "Programar recordatorio",
  editar_recordatorio: "Editar recordatorio",
  cancelar_recordatorio: "Cancelar recordatorio",
  contacto: "Llamada",
  observacion: "Observación",
  cancelar: "Cancelar",
  reprogramar: "Reprogramar",
  registrar_resultado: "Registrar atención",
  cerrar_cita: "Cierre automático",
  calificar: "Calificar la atención",
  recuperar_cupo: "Recuperar cupo (lista de espera)",
};

const ACCIONES_CUENTAS = {
  crear_cuenta: "Crear cuenta",
  cambiar_rol: "Cambiar rol",
  desactivar_cuenta: "Desactivar cuenta",
  activar_cuenta: "Activar cuenta",
  cambiar_clave: "Cambiar contraseña",
  cambiar_nombre_cuenta: "Cambiar nombre de la cuenta",
};

const ACCIONES_ESPECIALISTAS = {
  crear_especialista: "Agregar especialista",
  editar_especialista: "Cambiar horario",
  desactivar_especialista: "Desactivar especialista",
  activar_especialista: "Activar especialista",
  sincronizar_ips: "Actualización de la IPS",
  crear_sede: "Agregar sede",
  editar_sede: "Editar sede",
  desactivar_sede: "Cerrar sede",
  activar_sede: "Abrir sede",
};

const CATEGORIAS = [
  ["", "Todos"],
  ["citas", "Citas y pacientes"],
  ["cuentas", "Cuentas del personal"],
];

const RESPONSABLES = [
  ["", "Todos"],
  ["paciente", "Pacientes"],
  ["personal", "Personal"],
  ["sistema", "Sistema"],
];

export default function AdminAuditoriaPage() {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [accion, setAccion] = useState("");
  const [categoria, setCategoria] = useState("");
  const [responsable, setResponsable] = useState("");
  const [texto, setTexto] = useState("");

  useEffect(() => {
    listarAuditoria({ accion, categoria })
      .then(setRegistros)
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [accion, categoria]);

  const visibles = useMemo(() => {
    const buscado = texto.trim().toLowerCase();
    return registros.filter(
      (r) =>
        (!responsable || r.actor_tipo === responsable) &&
        (!buscado ||
          [
            r.actor_nombre,
            r.actor_correo,
            r.paciente_nombre,
            r.numero_comprobante,
            r.descripcion,
            r.cuenta_nombre,
            r.cuenta_correo,
          ]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(buscado)))
    );
  }, [registros, responsable, texto]);

  return (
    <>
      <div className="admin-encabezado">
        <div>
          <h1 className="admin-titulo">Auditoría</h1>
          <p className="admin-subtitulo">
            Registro de las acciones realizadas por pacientes, personal y sistema sobre las citas y las cuentas del
            personal. Los registros no pueden modificarse ni eliminarse.
          </p>
        </div>
      </div>

      <div className="filtros-admin filtros-admin--auditoria">
        <div className="field">
          <label htmlFor="texto">Buscar</label>
          <div className="campo-con-icono">
            <IconoBuscar />
            <input
              id="texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej. paciente, responsable, correo o comprobante"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="categoria">Registros</label>
          <select
            id="categoria"
            value={categoria}
            onChange={(e) => {
              setCargando(true);
              setCategoria(e.target.value);
              setAccion("");
            }}
          >
            {CATEGORIAS.map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="accion">Acción</label>
          <select
            id="accion"
            value={accion}
            onChange={(e) => {
              setCargando(true);
              setAccion(e.target.value);
            }}
          >
            <option value="">Todas</option>
            {categoria !== "cuentas" && (
              <optgroup label="Citas y pacientes">
                {Object.entries(ACCIONES_CITAS).map(([valor, nombre]) => (
                  <option key={valor} value={valor}>
                    {nombre}
                  </option>
                ))}
              </optgroup>
            )}
            {categoria !== "cuentas" && (
              <optgroup label="Especialistas, sedes e IPS">
                {Object.entries(ACCIONES_ESPECIALISTAS).map(([valor, nombre]) => (
                  <option key={valor} value={valor}>
                    {nombre}
                  </option>
                ))}
              </optgroup>
            )}
            {categoria !== "citas" && (
              <optgroup label="Cuentas del personal">
                {Object.entries(ACCIONES_CUENTAS).map(([valor, nombre]) => (
                  <option key={valor} value={valor}>
                    {nombre}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="field">
          <label htmlFor="responsable">Responsable</label>
          <select id="responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
            {RESPONSABLES.map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Responsable</th>
              <th>Acción</th>
              <th>Cita o cuenta</th>
              <th>Estado anterior</th>
              <th>Estado nuevo</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.id}>
                <td>
                  <FechaHora valor={r.fecha} />
                </td>
                <td>
                  <span className="celda-doble">
                    <span className="celda-persona__nombre">{r.actor_nombre}</span>
                    {r.actor_correo && <span className="celda-doble__dato">{r.actor_correo}</span>}
                  </span>
                </td>
                <td>
                  <span className="celda-doble">
                    <span>{r.descripcion}</span>
                    {r.detalle && <span className="celda-doble__dato">“{r.detalle}”</span>}
                  </span>
                </td>
                <td>
                  {r.cuenta_nombre ? (
                    // La cuenta como era en ese momento: nombre, correo y rol.
                    <span className="celda-doble">
                      <span>{r.cuenta_nombre}</span>
                      <span className="celda-doble__dato">
                        {r.cuenta_correo} · {r.cuenta_rol}
                      </span>
                    </span>
                  ) : (
                    <span className="celda-doble">
                      {r.cita_id ? (
                        <Link className="admin-comprobante admin-comprobante--enlace" to={`/admin/citas/${r.cita_id}`}>
                          {r.numero_comprobante ?? "Ver cita"}
                        </Link>
                      ) : (
                        <span>—</span>
                      )}
                      {r.paciente_nombre && <span className="celda-doble__dato">{r.paciente_nombre}</span>}
                    </span>
                  )}
                </td>
                <td>{r.estado_anterior ?? "—"}</td>
                <td>{r.estado_nuevo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && visibles.length === 0 && <p className="tabla-vacia">No hay registros con esos filtros.</p>}
      </div>
    </>
  );
}
