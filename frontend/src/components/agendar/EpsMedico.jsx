import { relacionConMedico } from "../../utils/eps";

/**
 * La EPS del médico, en corto, junto a su nombre: azul si es la del paciente
 * ("Sura"), verde si es una aliada ("Savia Salud · aliada"), ámbar si es
 * particular ("Particular": cuesta más) y gris si es de otra EPS (no puede
 * agendar con él). Ver utils/eps.
 */
export default function EpsMedico({ especialista, paciente }) {
  const eps = especialista.eps;
  const relacion = relacionConMedico(paciente, especialista);
  const texto = !eps ? "Particular" : relacion === "aliada" ? `${eps.nombre_corto} · aliada` : eps.nombre_corto;
  const titulo = {
    propia: `Médico de ${eps?.nombre}, su EPS`,
    aliada: `${eps?.nombre} es aliada de su EPS: puede agendar con este médico`,
    particular: eps ? `Atiende a afiliados de ${eps.nombre}: para usted es una consulta particular` : "Médico particular",
    otra: `Atiende a afiliados de ${eps?.nombre}: no está disponible con su EPS`,
    libre: eps ? `Atiende a afiliados de ${eps.nombre}` : "Médico particular",
  }[relacion];
  return (
    <span className={`eps-medico eps-medico--${relacion}`} title={titulo}>
      {texto}
    </span>
  );
}
