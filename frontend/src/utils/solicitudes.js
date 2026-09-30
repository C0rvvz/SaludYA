// Textos de las solicitudes de cita (cartas de petición), compartidos por el paciente y el personal.

export const TIPOS_SOLICITUD = {
  formal: "Solicitud formal",
  derecho_peticion: "Derecho de petición",
};

export const TIPOS_CITA = {
  primera_vez: "Primera vez",
  control: "Control",
};

// HU-77: pendiente y aprobada (más los estados intermedios y la negativa).
export const ESTADOS_SOLICITUD = {
  pendiente: ["Pendiente de revisión", "badge--warning"],
  pendiente_eps: ["En trámite con la EPS", "badge--neutral"],
  aprobada: ["Aprobada", "badge--success"],
  negada: ["No aprobada", "badge--error"],
};
