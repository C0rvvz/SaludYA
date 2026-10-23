import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { iniciales } from "../utils/avatar";
import { EVENTO_ABRIR_ELI } from "../utils/eli";
import AsistenteChat from "./AsistenteChat";
import { IconoAgendar, IconoCarta, IconoChat, IconoEspera, IconoMisCitas, IconoSalir } from "./Iconos";
import Logo from "./Logo";

// Los nombres dicen lo que se hace en cada apartado, sin términos técnicos.
const SECCIONES = [
  { to: "/panel", texto: "Agendar", corto: "Agendar", Icono: IconoAgendar },
  { to: "/mis-citas", texto: "Mis citas", corto: "Mis citas", Icono: IconoMisCitas },
  { to: "/lista-espera", texto: "Avisarme si hay cupo", corto: "Espera", Icono: IconoEspera },
  { to: "/solicitudes", texto: "Hacer una petición", corto: "Petición", Icono: IconoCarta },
];

/**
 * Encabezado de las páginas del paciente con sesión, y Eli (el asistente),
 * que está en todas ellas.
 *
 * - Computador: menú superior en píldoras; a la derecha, iniciales, nombre
 *   y EPS de la persona y el botón "Cerrar sesión".
 * - Celular: barra superior corta (logo y salir) y barra inferior de
 *   pestañas con íconos; la última abre a Eli.
 *
 * `onCambioCitas`: se llama cuando Eli agenda, cancela o cambia una cita.
 */
export default function EncabezadoPaciente({ onCambioCitas }) {
  const { paciente, cerrarSesion } = useAuth();
  const [eliAbierto, setEliAbierto] = useState(false);
  const abrirEli = useCallback(() => setEliAbierto(true), []);
  const cerrarEli = useCallback(() => setEliAbierto(false), []);

  // Otros botones de la página también abren a Eli (ver utils/eli.js).
  useEffect(() => {
    window.addEventListener(EVENTO_ABRIR_ELI, abrirEli);
    return () => window.removeEventListener(EVENTO_ABRIR_ELI, abrirEli);
  }, [abrirEli]);

  const clasePildora = ({ isActive }) => `menu-paciente__enlace ${isActive ? "is-active" : ""}`;
  const clasePestana = ({ isActive }) => `barra-paciente__pestana ${isActive ? "is-active" : ""}`;
  const nombre = paciente?.nombre ?? "";

  return (
    <>
      <header className="cabecera-paciente">
        <Logo to="/panel" />
        <nav className="menu-paciente" aria-label="Menú del paciente">
          {SECCIONES.map((s) => (
            <NavLink key={s.to} to={s.to} className={clasePildora}>
              {s.texto}
            </NavLink>
          ))}
        </nav>
        <div className="cabecera-paciente__persona">
          <span className="cabecera-paciente__iniciales" aria-hidden="true">
            {iniciales(nombre)}
          </span>
          <div className="cabecera-paciente__datos">
            <p className="cabecera-paciente__nombre">{nombre}</p>
            {paciente?.eps && <p className="cabecera-paciente__eps">{paciente.eps}</p>}
          </div>
          <span className="cabecera-paciente__divisor" aria-hidden="true" />
          <button type="button" className="boton-salir" onClick={cerrarSesion}>
            <IconoSalir />
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Celular: pestañas abajo, al alcance del pulgar */}
      <nav className="barra-paciente" aria-label="Menú del paciente (celular)">
        {SECCIONES.map(({ to, corto, Icono }) => (
          <NavLink key={to} to={to} className={clasePestana}>
            <span className="barra-paciente__icono">
              <Icono />
            </span>
            {corto}
          </NavLink>
        ))}
        <button
          type="button"
          className={`barra-paciente__pestana ${eliAbierto ? "is-active" : ""}`}
          onClick={abrirEli}
          aria-label="Eli, su guía de SaludYA"
        >
          <span className="barra-paciente__icono">
            <IconoChat />
          </span>
          Eli
        </button>
      </nav>

      <AsistenteChat abierto={eliAbierto} onAbrir={abrirEli} onCerrar={cerrarEli} onCambioCitas={onCambioCitas} />
    </>
  );
}
