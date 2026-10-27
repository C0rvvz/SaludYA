import { relacionConMedico } from "../../utils/eps";

/**
 * La EPS del médico, en corto, junto a su nombre ("Sura"): azul si es la del
 * paciente, verde si es una aliada ("Aliada · Savia") y gris si es de otra
 * EPS (no puede agendar con él). Ver utils/eps.
 */
export default function EpsMedico({ especialista, paciente }) {
  const eps = especialista.eps;
  if (!eps) return null;
  const relacion = relacionConMedico(paciente, especialista);
  const titulo = {
    propia: `Médico de ${eps.nombre}, su EPS`,
    aliada: `${eps.nombre} es aliada de su EPS: puede agendar con este médico`,
    otra: `Atiende a afiliados de ${eps.nombre}: no está disponible con su EPS`,
    libre: `Atiende a afiliados de ${eps.nombre}`,
  }[relacion];
  return (
    <span className={`eps-medico eps-medico--${relacion}`} title={titulo}>
      {relacion === "aliada" ? `Aliada · ${eps.nombre_corto}` : eps.nombre_corto}
    </span>
  );
}
