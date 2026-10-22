/**
 * Íconos de línea del rediseño (SVG en línea, sin librerías). Son
 * decorativos: el texto del botón o del enlace dice qué hace.
 */

function Svg({ tamano = 22, children }) {
  return (
    <svg viewBox="0 0 24 24" width={tamano} height={tamano} fill="none" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const trazo = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

/** Chevron para avanzar o volver (va dentro de .btn__circulo). */
export function Chevron({ hacia = "derecha", tamano = 16 }) {
  return (
    <Svg tamano={tamano}>
      <path d={hacia === "derecha" ? "M9.5 6l6 6-6 6" : "M14.5 6 8.5 12l6 6"} {...trazo} strokeWidth={2.2} />
    </Svg>
  );
}

export function IconoAgendar({ tamano }) {
  return (
    <Svg tamano={tamano}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" {...trazo} />
      <path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5" {...trazo} />
    </Svg>
  );
}

export function IconoMisCitas({ tamano }) {
  return (
    <Svg tamano={tamano}>
      <rect x="4" y="3.5" width="16" height="17" rx="3" {...trazo} />
      <path d="M8 9h8M8 13h8M8 17h5" {...trazo} />
    </Svg>
  );
}

export function IconoEspera({ tamano }) {
  return (
    <Svg tamano={tamano}>
      <circle cx="12" cy="12" r="8.5" {...trazo} />
      <path d="M12 7.5V12l3 2" {...trazo} />
    </Svg>
  );
}

export function IconoCarta({ tamano }) {
  return (
    <Svg tamano={tamano}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" {...trazo} />
      <path d="m4.5 7 7.5 6 7.5-6" {...trazo} />
    </Svg>
  );
}

export function IconoChat({ tamano }) {
  return (
    <Svg tamano={tamano}>
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5v-8Z"
        {...trazo}
      />
      <path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" {...trazo} strokeWidth={2.4} />
    </Svg>
  );
}

export function IconoSalir({ tamano = 20 }) {
  return (
    <Svg tamano={tamano}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" {...trazo} strokeWidth={2} />
    </Svg>
  );
}

export function IconoMensaje({ tamano = 24 }) {
  return (
    <Svg tamano={tamano}>
      <path d="M4 6h16v10H8l-4 4V6Z" {...trazo} />
    </Svg>
  );
}
