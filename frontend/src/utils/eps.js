/**
 * Cada médico atiende a los afiliados de una EPS (especialista.eps) y dos
 * EPS aliadas comparten sus médicos. Para el paciente, cada médico es:
 *
 *   - "propia": de su EPS.
 *   - "aliada": de una EPS aliada a la suya (puede agendar con él).
 *   - "otra": de otra EPS (lo ve, pero no puede agendar con él).
 *   - "libre": el paciente es particular (sin EPS): puede con cualquiera.
 *
 * El servidor aplica la misma regla (eps_service): esto solo es para mostrarla.
 */
export function relacionConMedico(paciente, especialista) {
  if (!paciente?.eps_id || !especialista?.eps) return "libre";
  if (especialista.eps.id === paciente.eps_id) return "propia";
  if (paciente.eps_aliadas?.includes(especialista.eps.id)) return "aliada";
  return "otra";
}

export const puedeAgendarCon = (paciente, especialista) => relacionConMedico(paciente, especialista) !== "otra";
