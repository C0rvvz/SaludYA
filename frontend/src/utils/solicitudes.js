// Textos de las peticiones del paciente, compartidos por el paciente y el personal.

export const TIPOS_SOLICITUD = {
  formal: "Pedir una cita en otra fecha",
  derecho_peticion: "Derecho de petición",
};

// Qué es cada tipo de petición, en palabras sencillas: lo lee el paciente antes de elegir.
export const EXPLICACION_SOLICITUD = {
  formal: {
    texto:
      "Úsela si ninguno de los horarios disponibles le sirve o si necesita la cita antes. Cuéntenos por qué y el personal de su EPS la revisará.",
    ejemplo: "Ejemplo: «Necesito la cita antes del 15 porque ese día me operan».",
    pregunta: "¿Por qué no le sirven los horarios disponibles, o por qué necesita esa fecha?",
  },
  derecho_peticion: {
    texto:
      "Es una petición formal que protege la ley: su EPS está obligada a responderle por escrito en máximo 15 días hábiles. Úsela si ya pidió la cita y no le han dado respuesta.",
    ejemplo: "Ejemplo: «Pedí la cita de cardiología hace un mes y no me han respondido».",
    pregunta: "¿Qué le pide a su EPS y por qué?",
  },
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

// Lo mismo, como lo lee el paciente ("su EPS").
export const ESTADOS_SOLICITUD_PACIENTE = {
  ...ESTADOS_SOLICITUD,
  pendiente_eps: ["En trámite con su EPS", "badge--warning"],
};

// "Novedad: …" de una petición que todavía no se decide.
export const NOVEDAD_SOLICITUD = {
  pendiente: "la estamos revisando",
  pendiente_eps: "su EPS la está revisando",
};

// Para el personal: nombres formales del tipo de petición, el estado corto de
// la tabla y los grupos de los chips con contador.
export const TIPOS_SOLICITUD_PERSONAL = {
  formal: "Petición de cita",
  derecho_peticion: "Derecho de petición",
};

export const ESTADO_SOLICITUD_CORTO = {
  pendiente: "Pendiente",
  pendiente_eps: "En trámite con la EPS",
  aprobada: "Aprobada",
  negada: "No aprobada",
};

export const GRUPOS_SOLICITUD = [
  ["pendiente", "Pendientes"],
  ["pendiente_eps", "En trámite con la EPS"],
  ["aprobada", "Aprobadas"],
  ["negada", "No aprobadas"],
];
