// Textos de las cartas y peticiones del paciente, compartidos por el paciente y el personal.

export const TIPOS_SOLICITUD = {
  formal: "Pedir una cita en otra fecha",
  derecho_peticion: "Derecho de petición",
};

// Qué es cada tipo de carta, en palabras sencillas: lo lee el paciente antes de elegir.
export const EXPLICACION_SOLICITUD = {
  formal: {
    texto:
      "Ninguno de los horarios disponibles le sirve, o necesita la cita antes. Cuéntenos por qué y el personal de su EPS la revisa.",
    ejemplo: "Ejemplo: «Necesito la cita antes del 15 porque ese día me operan».",
    pregunta: "¿Por qué no le sirven los horarios disponibles, o por qué necesita esa fecha?",
    boton: "Enviar mi carta",
  },
  derecho_peticion: {
    texto:
      "Es una petición formal que protege la ley: su EPS está obligada a responderle por escrito en máximo 15 días hábiles. Úsela si ya pidió la cita y no le han dado respuesta.",
    ejemplo: "Ejemplo: «Pedí la cita de cardiología hace un mes y no me han respondido».",
    pregunta: "¿Qué le pide a su EPS y por qué?",
    boton: "Enviar mi derecho de petición",
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
