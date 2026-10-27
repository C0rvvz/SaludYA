import { Link } from "react-router-dom";
import { IconoCandado } from "./IconosAdmin";

const POR_DEFECTO =
  "El diagnóstico y la fórmula médica hacen parte de la historia clínica del paciente. Solo pueden verlos los " +
  "médicos tratantes y Coordinación médica. Si lo necesita para su trabajo, solicite el acceso a Coordinación médica.";

/**
 * Historia clínica sin permiso: un rol que no la tiene (p. ej. Call center)
 * o un médico con alguien que no es su paciente (`mensaje`, del backend).
 * Vuelve al detalle de la cita desde donde llegó (`citaId`).
 */
export default function SinPermisoHistoria({ citaId, mensaje }) {
  return (
    <section className="card sin-permiso" aria-labelledby="titulo-sin-permiso">
      <span className="sin-permiso__icono" aria-hidden="true">
        <IconoCandado tamano={24} />
      </span>
      <h1 className="sin-permiso__titulo" id="titulo-sin-permiso">
        No tiene permiso para ver esta información
      </h1>
      <p className="sin-permiso__texto">{mensaje ?? POR_DEFECTO}</p>
      <Link to={citaId ? `/admin/citas/${citaId}` : "/admin/citas"} className="btn btn--primary">
        {citaId ? "Volver al detalle de la cita" : "Ir a Gestión de citas"}
      </Link>
    </section>
  );
}
