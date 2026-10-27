// Personal › Historia clínica (acceso restringido: Médico y Coordinación médica).

// Color de la insignia según cómo va la entrega de la fórmula.
export const CLASE_ESTADO_FORMULA = {
  entregada: "badge--success",
  parcial: "badge--warning",
  por_reclamar: "badge--info",
  vencida: "badge--error",
  sin_medicamentos: "badge--neutral",
  sin_formula: "badge--neutral",
};

export const PERIODOS = [
  ["7", "Últimos 7 días"],
  ["30", "Últimos 30 días"],
  ["90", "Últimos 3 meses"],
  ["365", "Último año"],
  ["todo", "Todo el historial"],
];

export const AVISO_RESERVADO =
  "Información reservada. Solo pueden verla los médicos tratantes y Coordinación médica. Cada consulta queda registrada en Auditoría.";

// Códigos CIE-10 frecuentes en consulta externa, para elegir rápido (se puede escribir cualquier otro).
export const CIE10_FRECUENTES = [
  ["A09", "Diarrea y gastroenteritis de presunto origen infeccioso"],
  ["E11.9", "Diabetes mellitus tipo 2 sin complicaciones"],
  ["E78.5", "Hiperlipidemia, no especificada"],
  ["F41.1", "Trastorno de ansiedad generalizada"],
  ["I10", "Hipertensión esencial (primaria)"],
  ["J00", "Rinofaringitis aguda (resfriado común)"],
  ["J02.9", "Faringitis aguda, no especificada"],
  ["J06.9", "Infección aguda de las vías respiratorias superiores"],
  ["J20.9", "Bronquitis aguda, no especificada"],
  ["J45.9", "Asma, no especificada"],
  ["K21.9", "Enfermedad del reflujo gastroesofágico sin esofagitis"],
  ["K29.7", "Gastritis, no especificada"],
  ["L25.9", "Dermatitis de contacto, de causa no especificada"],
  ["L70.0", "Acné vulgar"],
  ["M54.5", "Lumbago no especificado"],
  ["M17.9", "Gonartrosis, no especificada"],
  ["N39.0", "Infección de vías urinarias, sitio no especificado"],
  ["R51", "Cefalea"],
  ["S93.4", "Esguince y torcedura del tobillo"],
  ["Z00.0", "Examen médico general"],
];
