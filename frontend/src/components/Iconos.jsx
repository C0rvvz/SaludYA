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

const TRAZOS_CHEVRON = {
  derecha: "M9.5 6l6 6-6 6",
  izquierda: "M14.5 6 8.5 12l6 6",
  abajo: "M6 9.5l6 6 6-6",
  arriba: "M6 14.5l6-6 6 6",
};

/** Chevron para avanzar o volver (va dentro de .btn__circulo), o para ver más o menos. */
export function Chevron({ hacia = "derecha", tamano = 16 }) {
  return (
    <Svg tamano={tamano}>
      <path d={TRAZOS_CHEVRON[hacia]} {...trazo} strokeWidth={2.2} />
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

/** "Recargar mi posición" / "Recargar estado" */
export function IconoRecargar({ tamano = 18 }) {
  return (
    <Svg tamano={tamano}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" {...trazo} strokeWidth={2.2} />
    </Svg>
  );
}

/** "Me arrepentí, ver el cupo otra vez" */
export function IconoDeshacer({ tamano = 18 }) {
  return (
    <Svg tamano={tamano}>
      <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" {...trazo} strokeWidth={2.2} />
    </Svg>
  );
}

/** Medicamento de la fórmula médica */
export function IconoPastilla({ tamano = 22 }) {
  return (
    <Svg tamano={tamano}>
      <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" {...trazo} />
      <path d="m9.5 9.5 5 5" {...trazo} />
    </Svg>
  );
}

export function IconoDescargar({ tamano = 20 }) {
  return (
    <Svg tamano={tamano}>
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" {...trazo} strokeWidth={2} />
    </Svg>
  );
}

/** "Cómo llegar" */
export function IconoUbicacion({ tamano = 20 }) {
  return (
    <Svg tamano={tamano}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" {...trazo} strokeWidth={2} />
      <circle cx="12" cy="10" r="2.3" {...trazo} strokeWidth={2} />
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
