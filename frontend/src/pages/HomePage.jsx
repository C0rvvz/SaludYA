import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import { buscarDisponibilidad } from "../api/catalogo";
import { formatearFecha, formatearHora, capitalizar } from "../utils/formato";

const PASOS = [
  {
    numero: 1,
    titulo: "Regístrese en segundos",
    texto: "Su documento, su WhatsApp y su EPS, nada más.",
  },
  {
    numero: 2,
    titulo: "Verifique su identidad",
    texto: "Recibirá un código por WhatsApp. Sin contraseñas que memorizar.",
  },
  {
    numero: 3,
    titulo: "Busque su especialista",
    texto: "Filtre por especialidad, sede, modalidad y horario disponible.",
  },
  {
    numero: 4,
    titulo: "Confirme y listo",
    texto: "Su cita queda registrada de inmediato, con comprobante incluido.",
  },
];

const ACCESIBILIDAD = [
  {
    icono: "Aa",
    titulo: "Textos grandes y claros",
    texto: "Cada pantalla está diseñada para leerse sin esfuerzo, sin importar la edad.",
  },
  {
    icono: "🔒",
    titulo: "Sin contraseñas que recordar",
    texto: "El acceso se realiza con su documento y un código enviado por WhatsApp, sin nada que anotar ni olvidar.",
  },
  {
    icono: "①",
    titulo: "Un paso a la vez",
    texto: "Cada formulario avanza de forma gradual, sin presentar toda la información a la vez.",
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
            Agende, confirme y dé seguimiento a sus citas médicas sin filas ni
            llamadas.
          </p>
        </div>
        <nav className="site-header__nav">
          <Link to="/iniciar-sesion" className="btn btn--outline">
            Iniciar sesión
          </Link>
          <Link to="/registrarse" className="btn btn--primary">
            Registrarse
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div>
          <span className="hero__eyebrow">✨ Su cita médica, sin complicaciones</span>
          <h1>Su cita médica, sin filas ni esperas prolongadas</h1>
          <p className="hero__lead">
            Busque especialista, elija sede y horario, y confirme. Todo desde
            su celular, con el código de acceso enviado directamente a su
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
        <h2>Así de sencillo funciona</h2>
        <p className="section__lead">
          Cuatro pasos entre la búsqueda del especialista y la confirmación de
          la cita.
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
          Incluidas las personas que no utilizan aplicaciones con frecuencia.
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
        <span>SaludYA: proyecto universitario. Datos e instituciones ficticios con fines académicos.</span>
        <span>© 2026 SaludYA</span>
      </footer>
    </div>
  );
}