import { Link, useLocation } from "react-router-dom";

/**
 * Logo de SaludYA. Con `to`, es un enlace al inicio de quien lo ve (como
 * en la mayoría de páginas web): la búsqueda de citas para el paciente y
 * la gestión de citas para el personal. Si ya está en esa página, lo
 * lleva hasta arriba (en el inicio, con desplazamiento suave).
 */
const MEDIDAS = { sm: 30, md: 36, lg: 44 };

export default function Logo({ size = "md", to }) {
  const { pathname } = useLocation();
  const dims = MEDIDAS[size] ?? MEDIDAS.md;

  const contenido = (
    <>
      <span className="logo__mark" style={{ width: dims, height: dims }}>
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" aria-hidden="true">
          <path
            d="M2 12h4l2-7 4 14 2-7h8"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="logo__text">
        Salud<span className="logo__accent">YA</span>
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={`logo logo--${size}`}
        aria-label="SaludYA, ir al inicio"
        onClick={() => pathname === to && window.scrollTo({ top: 0 })}
      >
        {contenido}
      </Link>
    );
  }
  return <span className={`logo logo--${size}`}>{contenido}</span>;
}
