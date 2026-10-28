import { Link } from "react-router-dom";
import { propsPantallaProtegida } from "../utils/campoProtegido";
import { esDemostracion } from "../utils/entorno";
import { Chevron } from "./Iconos";
import Logo from "./Logo";

/**
 * Marco de las pantallas de ingreso, registro y confirmación (sistema 2a).
 *
 * - `lado`: lo que va a la izquierda en computador (el celular de muestra
 *   del ingreso, o Eli en el registro). En celular no se muestra.
 * - `pie`: tarjetas debajo de la principal ("¿No tiene cuenta?...").
 * - `protegida` (las de ingreso, RNF-16): nada de su texto se puede
 *   seleccionar ni copiar.
 */
export default function AuthShell({ children, protegida = false, lado = null, pie = null, ancho = "normal" }) {
  return (
    <div
      className={`auth-page ${protegida ? "auth-page--protegida" : ""}`}
      {...(protegida ? propsPantallaProtegida : {})}
    >
      <Link to="/" className="btn-volver auth-page__back">
        <span className="btn__circulo">
          <Chevron hacia="izquierda" />
        </span>
        Volver al inicio
      </Link>

      <div className={`auth-layout ${lado ? "auth-layout--dividido" : ""}`}>
        {lado && <div className="auth-layout__lado">{lado}</div>}
        <div className={`auth-layout__columna auth-layout__columna--${ancho}`}>
          <div className="auth-card">
            <div className="auth-card__logo">
              <Logo to="/" size="lg" />
            </div>
            {esDemostracion() && (
              <p className="aviso-demostracion" role="note">
                <strong>Versión de demostración.</strong> Use solo datos de prueba, nunca sus datos reales.
              </p>
            )}
            {children}
          </div>
          {pie}
        </div>
      </div>
    </div>
  );
}
