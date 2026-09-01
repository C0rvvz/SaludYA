import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <Link to="/" className="btn btn--outline auth-page__back">
        ← Volver al inicio
      </Link>

      <div className="auth-card">
        <div className="auth-card__logo">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
