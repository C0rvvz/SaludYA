import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import { buscarDisponibilidad } from "../api/catalogo";
import { formatearFecha, formatearHora, capitalizar } from "../utils/formato";

const PASOS = [
  {
    numero: 1,
    titulo: "Regístrate en segundos",
    texto: "Tu documento, tu WhatsApp y tu EPS — nada más.",
  },
  {
    numero: 2,
    titulo: "Verifica tu identidad",
    texto: "Te llega un código por WhatsApp. Sin contraseñas que memorizar.",
  },
  {
    numero: 3,
    titulo: "Busca tu especialista",
    texto: "Filtra por especialidad, sede, modalidad y horario disponible.",
  },
  {
    numero: 4,
    titulo: "Confirma y listo",
    texto: "Tu cita queda registrada al instante, con comprobante incluido.",
  },
];

const ACCESIBILIDAD = [
  {
    icono: "Aa",
    titulo: "Textos grandes y claros",
    texto: "Cada pantalla está pensada para leerse sin esfuerzo, sin importar la edad.",
  },
  {
    icono: "🔒",
    titulo: "Sin contraseñas que recordar",
    texto: "Entras con tu documento y un código por WhatsApp — nada que anotar ni olvidar.",
  },
  {
    icono: "①",
    titulo: "Un paso a la vez",
    texto: "Cada formulario avanza de a poco, sin abrumarte con todo junto.",
  },
];

export default function HomePage() {
  // Franja de disponibilidad REAL, sacada en vivo del backend -- no
  // es un dato inventado para el mockup. Este endpoint es público
  // (no requiere sesión), así que se puede mostrar desde el Home.
  const [ejemplo, setEjemplo] = useState(null);

  useEffect(() => {
    buscarDisponibilidad({})
      .then((resultados) => setEjemplo(resultados[0] ?? null))
      .catch(() => setEjemplo(null));
  }, []);

  return (
    <div>
      <header className="site-header">
        <div>
          <Logo />
          <p className="site-header__tagline">
            Agenda, confirma y da seguimiento a tus citas médicas sin filas ni
            llamadas.
          </p>
        </div>
        <nav className="site-header__nav">
          <Link to="/iniciar-sesion" className="btn btn--outline">
            Iniciar sesión
          </Link>
          <Link to="/registrarse" className="btn btn--primary">
            Registrarme
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div>
          <span className="hero__eyebrow">✨ Tu cita médica, sin vueltas</span>
          <h1>Tu cita médica, sin filas ni esperas eternas</h1>
          <p className="hero__lead">
            Busca especialista, elige sede y horario, y confirma — todo desde
            tu celular, con el código de acceso llegándote directo a tu
            WhatsApp.
          </p>
        </div>

        {ejemplo && (
          <div className="appointment-preview">
            <div className="appointment-preview__top">
              <span className="appointment-preview__title">
                {ejemplo.especialista.especialidad.nombre} · {ejemplo.especialista.nombre}
              </span>
              <span className="badge badge--success">Disponible</span>
            </div>
            <div className="appointment-preview__row">
              <span>
                {formatearFecha(ejemplo.fecha)} · {formatearHora(ejemplo.hora)}
              </span>
              <span>{ejemplo.sede.nombre}</span>
            </div>
            <div className="appointment-preview__reminder">
              <span>Modalidad</span>
              <span>{capitalizar(ejemplo.modalidad)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Así de simple funciona</h2>
        <p className="section__lead">
          Cuatro pasos entre buscar tu especialista y tener tu cita confirmada.
        </p>
        <div className="grid-4">
          {PASOS.map((paso) => (
            <div className="info-card" key={paso.numero}>
              <span className="info-card__number">{paso.numero}</span>
              <h3>{paso.titulo}</h3>
              <p>{paso.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Pensado para todas las personas</h2>
        <p className="section__lead">
          Incluyendo a quienes no usan apps todos los días.
        </p>
        <div className="grid-3">
          {ACCESIBILIDAD.map((item) => (
            <div className="info-card" key={item.titulo}>
              <span className="info-card__icon">{item.icono}</span>
              <h3>{item.titulo}</h3>
              <p>{item.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>SaludYA — Proyecto universitario. Datos e instituciones ficticios.</span>
        <span>© 2026 SaludYA</span>
      </footer>
    </div>
  );
}
