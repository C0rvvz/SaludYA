import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { buscarDisponibilidad, listarSedes } from "../api/catalogo";
import CarruselCupos from "../components/inicio/CarruselCupos";
import Logo from "../components/Logo";
import { useAuth } from "../context/AuthContext";
import { FOTO_INICIO, proximosCupos } from "../utils/inicio";
import "../styles/inicio.css";

/**
 * Home público (rediseño 2a, "Casa de hormigón": gris frío, azul marino y
 * formas suaves). Pensado para adultos mayores: letra grande, botones de al
 * menos 44 px y pocas opciones. Los "próximos cupos" son horarios reales de
 * la API. "Sedes" y "Ayuda" del menú llevan a sus secciones al final.
 */

const BURBUJAS = [
  { etiqueta: "Aa · Lectura", titulo: "Letra grande", texto: "Cada pantalla se lee sin esfuerzo, sin importar la edad." },
  { etiqueta: "WhatsApp", titulo: "Sin contraseñas", texto: "Su cédula y un código por WhatsApp. Nada que anotar.", oscura: true },
  { etiqueta: "Paso a paso", titulo: "Un paso a la vez", texto: "Una sola pregunta por pantalla, sin prisa." },
];

const PASOS = [
  { numero: "01", titulo: "Regístrese", texto: "Documento, WhatsApp y EPS. Nada más." },
  { numero: "02", titulo: "Reciba su código", texto: "Llega a su WhatsApp. Sin contraseñas." },
  { numero: "03", titulo: "Elija especialista", texto: "Una pregunta a la vez: especialidad, día, hora." },
  { numero: "04", titulo: "Listo", texto: "Comprobante inmediato y recordatorio." },
];

const PREGUNTAS = [
  {
    pregunta: "¿Necesito una contraseña?",
    respuesta:
      "No. Ingresa con su número de documento y un código de 6 dígitos que le llega por WhatsApp. El código vence a los 5 minutos.",
  },
  {
    pregunta: "¿Cómo cambio o cancelo una cita?",
    respuesta:
      "En “Mis citas”, toque la cita y elija “Reprogramar” o “Cancelar”. Así el horario queda libre para otra persona.",
  },
  {
    pregunta: "¿Y si ningún horario me sirve?",
    respuesta:
      "Puede pedir que le avisemos cuando se libere un cupo, o escribir una carta pidiendo una cita en otra fecha.",
  },
  {
    pregunta: "¿Por qué se cerró mi sesión?",
    respuesta:
      "Por su seguridad, la sesión se cierra después de 2 minutos sin actividad o si ingresa desde otro equipo. Solo vuelva a ingresar.",
  },
];

export default function HomePage() {
  const { estaAutenticado } = useAuth();
  const { hash } = useLocation();
  const [cupos, setCupos] = useState(null); // null mientras carga
  const [sedes, setSedes] = useState([]);

  // Desde otra página (p. ej. "¿Problemas para entrar?" lleva a /#ayuda): ir a esa sección.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  // Estos endpoints son públicos (no requieren sesión).
  useEffect(() => {
    buscarDisponibilidad({})
      .then((franjas) => setCupos(proximosCupos(franjas)))
      .catch(() => setCupos([]));
    listarSedes()
      .then(setSedes)
      .catch(() => setSedes([]));
  }, []);

  return (
    <div className="inicio">
      <header className="inicio-cabecera">
        <div className="inicio-contenedor inicio-cabecera__fila">
          <Logo to="/" />
          <nav className="inicio-menu" aria-label="Secciones">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#sedes">Sedes</a>
            <a href="#ayuda">Ayuda</a>
          </nav>
          <div className="inicio-cabecera__acciones">
            {estaAutenticado ? (
              <Link to="/panel" className="inicio-boton inicio-boton--oscuro">
                Agendar cita
              </Link>
            ) : (
              <>
                <Link to="/registrarse" className="inicio-boton inicio-boton--borde" style={{ "--retraso": "1.2s" }}>
                  Registrarse
                </Link>
                <Link to="/iniciar-sesion" className="inicio-boton inicio-boton--oscuro">
                  Iniciar sesión
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="inicio-contenedor inicio-hero">
          <div className="inicio-hero__texto">
            <span className="inicio-ceja">EPS, IPS y médicos particulares · Todo en un solo lugar</span>
            <h1>Su cita médica, sin filas ni llamadas.</h1>
            <p className="inicio-hero__lead">Elija su médico y la hora que le quede mejor. Nosotros le avisamos.</p>
          </div>

          <div className="inicio-hero__visual">
            {cupos?.length ? (
              <CarruselCupos cupos={cupos} />
            ) : (
              // Sin horarios (o sin conexión) no se anuncia ningún cupo: solo la foto.
              <div className="inicio-carrusel">
                <div className="inicio-carrusel__fotos">
                  {cupos && <img src={FOTO_INICIO} alt="" className="is-activa" referrerPolicy="no-referrer" />}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="inicio-contenedor inicio-personas" aria-labelledby="titulo-personas">
          <div className="inicio-personas__texto">
            <h2 id="titulo-personas">Pensado para todas las personas</h2>
            <p>Incluidas las que no usan aplicaciones con frecuencia.</p>
          </div>
          <ul className="inicio-burbujas">
            {BURBUJAS.map((b) => (
              <li key={b.titulo} className="inicio-burbujas__item">
                <div className={`inicio-burbuja ${b.oscura ? "inicio-burbuja--oscura" : ""}`}>
                  <span className="inicio-burbuja__etiqueta">{b.etiqueta}</span>
                  <p className="inicio-burbuja__titulo">{b.titulo}</p>
                  <p className="inicio-burbuja__texto">{b.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="como-funciona" className="inicio-banda" aria-labelledby="titulo-pasos">
          <div className="inicio-contenedor">
            <h2 id="titulo-pasos">Así de sencillo</h2>
            <ol className="inicio-pasos">
              {PASOS.map((p) => (
                <li key={p.numero} className="inicio-paso">
                  <span className="inicio-paso__numero" aria-hidden="true">
                    {p.numero}
                  </span>
                  <p className="inicio-paso__titulo">{p.titulo}</p>
                  <p className="inicio-paso__texto">{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

      </main>

      {/* Pie oscuro: Sedes y Ayuda (destinos del menú) y, al final, el acceso del personal. */}
      <footer className="inicio-pie">
        <div className="inicio-contenedor inicio-pie__secciones">
          <section id="sedes" className="inicio-pie__seccion" aria-labelledby="titulo-sedes">
            <h2 id="titulo-sedes">Sedes</h2>
            <p className="inicio-pie__lead">Donde puede atenderse en persona. Muchas citas también son virtuales.</p>
            {sedes.length > 0 ? (
              <ul className="inicio-sedes">
                {sedes.map((s) => (
                  <li key={s.id} className="inicio-sede">
                    <span className="inicio-sede__nombre">{s.nombre}</span>
                    <span className="inicio-sede__ciudad">{s.ciudad}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inicio-pie__lead">Las sedes se muestran al elegir la especialidad.</p>
            )}
          </section>

          <section id="ayuda" className="inicio-pie__seccion" aria-labelledby="titulo-ayuda">
            <h2 id="titulo-ayuda">Ayuda</h2>
            <div className="inicio-preguntas">
              {PREGUNTAS.map((p) => (
                <details key={p.pregunta} className="inicio-pregunta">
                  <summary>{p.pregunta}</summary>
                  <p>{p.respuesta}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <div className="inicio-contenedor inicio-pie__fila">
          <span className="inicio-pie__marca">
            <span className="inicio-pie__logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
                <path d="M2 12h4l2-7 4 14 2-7h8" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            © 2026 SaludYA · Proyecto universitario con datos ficticios
          </span>
          <Link to="/admin/ingresar" className="inicio-pie__personal">
            <span className="inicio-pie__punto" aria-hidden="true" />
            Acceso para personal de la EPS o IPS
            <span className="inicio-pie__flecha" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
