import { formatearPesos } from "./formato";

/**
 * Cada médico atiende a los afiliados de una EPS (especialista.eps) o es
 * particular (sin EPS). Dos EPS aliadas comparten sus médicos. Para el
 * paciente, cada médico es:
 *
 *   - "propia": de su EPS (copago).
 *   - "aliada": de una EPS aliada a la suya (copago un poco mayor).
 *   - "particular": médico particular, o el paciente no tiene EPS. Se puede
 *     agendar, pero cuesta más.
 *   - "otra": de otra EPS no aliada (lo ve, pero no puede agendar con él).
 *   - "libre": todavía no se sabe quién es el paciente.
 *
 * El servidor aplica la misma regla y fija el valor al agendar
 * (eps_service); las tarifas llegan con el paciente (paciente.tarifas).
 */
export function relacionConMedico(paciente, especialista) {
  if (!paciente) return "libre";
  if (!especialista?.eps || !paciente.eps_id) return "particular";
  if (especialista.eps.id === paciente.eps_id) return "propia";
  if (paciente.eps_aliadas?.includes(especialista.eps.id)) return "aliada";
  return "otra";
}

export const puedeAgendarCon = (paciente, especialista) => relacionConMedico(paciente, especialista) !== "otra";

const TIPO_COBRO = { propia: "eps", aliada: "aliada", particular: "particular" };

/** Lo que cuesta la consulta con ese médico ("$8.000"), o null si no se sabe o no puede agendar. */
export function valorConMedico(paciente, especialista) {
  const valor = paciente?.tarifas?.[TIPO_COBRO[relacionConMedico(paciente, especialista)]];
  return valor == null ? null : formatearPesos(valor);
}

/** De qué es ese valor: "Copago EPS Sura", "Copago EPS aliada (Savia Salud)" o "Consulta particular". */
export function conceptoDelValor(paciente, especialista) {
  const relacion = relacionConMedico(paciente, especialista);
  if (relacion === "propia") return `Copago EPS ${paciente.eps}`;
  if (relacion === "aliada") return `Copago EPS aliada (${especialista.eps.nombre})`;
  return "Consulta particular";
}
