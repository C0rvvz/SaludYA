// Datos de ejemplo con la misma forma que responde el backend.

export const ESPECIALIDAD = { id: "esp-1", nombre: "Cardiología" };
export const OTRA_ESPECIALIDAD = { id: "esp-2", nombre: "Dermatología" };
export const SEDE = { id: "sede-1", nombre: "Sede Poblado", ciudad: "Medellín" };
export const OTRA_SEDE = { id: "sede-2", nombre: "Sede Laureles", ciudad: "Medellín" };
export const ESPECIALISTA = { id: "med-1", nombre: "Dr. Carlos Ramírez", especialidad: ESPECIALIDAD };
export const OTRO_ESPECIALISTA = { id: "med-2", nombre: "Dra. Ana Gómez", especialidad: OTRA_ESPECIALIDAD };

export function franja(id, fecha, hora, cambios = {}) {
  return { id, especialista: ESPECIALISTA, sede: SEDE, modalidad: "presencial", fecha, hora, ...cambios };
}

export const FRANJAS = [
  franja("f1", "2026-10-20", "08:00:00"),
  franja("f2", "2026-10-20", "10:00:00", { modalidad: "virtual" }),
  franja("f3", "2026-10-21", "15:00:00", { sede: OTRA_SEDE }),
  franja("f4", "2026-10-22", "09:00:00", { especialista: OTRO_ESPECIALISTA }),
];

export const PACIENTE = {
  id: "pac-1",
  nombre: "Laura Gómez",
  numero_documento: "1020304050",
  telefono_whatsapp: "3001234567",
  correo: "laura@correo.co",
};

export const TODOS_LOS_PERMISOS = [
  "asignar_prioridad",
  "gestionar_citas",
  "gestionar_usuarios",
  "observaciones",
  "registrar_atencion",
  "revisar_solicitudes",
  "ver_auditoria",
  "ver_citas",
  "ver_reportes",
];

export const PERSONAL = {
  id: "per-1",
  nombre: "Ana Admin",
  correo: "ana@saludya.co",
  rol: "administrador",
  rol_texto: "Administrador",
  activo: true,
  permisos: TODOS_LOS_PERMISOS,
  creado_en: "2026-09-01T10:00:00-05:00",
  ultimo_acceso_en: "2026-10-01T09:00:00-05:00",
};

/** Una cita como la ve el paciente en "Mis citas" (MiCitaOut). */
export function miCita(cambios = {}) {
  return {
    id: "cita-1",
    numero_comprobante: "SY-0001",
    especialista: ESPECIALISTA,
    sede: SEDE,
    modalidad: "presencial",
    fecha: "2026-10-20",
    hora: "08:00:00",
    canal_recordatorio: "whatsapp",
    estado: "confirmada",
    estado_visible: "pendiente_confirmar",
    estado_texto: "Pendiente de confirmar asistencia",
    creado_en: "2026-10-01T10:00:00-05:00",
    asistencia_confirmada_en: null,
    cancelada_en: null,
    motivo_cancelacion: null,
    recordatorio_enviado_en: null,
    llegada_registrada_en: null,
    cerrada_en: null,
    reprogramada_desde: null,
    reprogramada_a: null,
    calificacion: null,
    comentario_calificacion: null,
    puede_confirmar_asistencia: true,
    puede_cancelar: true,
    puede_reprogramar: true,
    puede_registrar_llegada: false,
    puede_calificar: false,
    llegada_disponible_desde: "2026-10-20T06:00:00",
    historial: [{ tipo: "agendada", fecha: "2026-10-01T10:00:00-05:00", descripcion: "Cita agendada" }],
    ...cambios,
  };
}

/** Cita del historial (ya pasó). */
export function citaPasada(id, estado_visible, estado_texto, fecha, cambios = {}) {
  return miCita({
    id,
    numero_comprobante: `SY-${id}`,
    fecha,
    estado: estado_visible === "cancelada" || estado_visible === "reprogramada" ? estado_visible : estado_visible,
    estado_visible,
    estado_texto,
    puede_confirmar_asistencia: false,
    puede_cancelar: false,
    puede_reprogramar: false,
    llegada_disponible_desde: null,
    ...cambios,
  });
}
