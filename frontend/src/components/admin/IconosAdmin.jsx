/**
 * Íconos de línea del panel del personal y el botón de ícono de 32 px
 * para las acciones secundarias de una fila. Los íconos son decorativos:
 * el botón lleva su nombre en `title` (al pasar el mouse) y `aria-label`.
 */

function Svg({ tamano = 15, children }) {
  return (
    <svg viewBox="0 0 24 24" width={tamano} height={tamano} fill="none" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const trazo = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const IconoConfirmar = () => (
  <Svg>
    <path d="m5 12.5 4.5 4.5L19 7.5" {...trazo} />
  </Svg>
);

export const IconoRecordatorio = () => (
  <Svg>
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2 2 0 0 0 4 0" {...trazo} />
  </Svg>
);

export const IconoLlamar = () => (
  <Svg>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" {...trazo} />
  </Svg>
);

export const IconoEditar = () => (
  <Svg>
    <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" {...trazo} />
  </Svg>
);

export const IconoQuitar = () => (
  <Svg>
    <path d="M6 6l12 12M18 6 6 18" {...trazo} />
  </Svg>
);

export const IconoReintentar = () => (
  <Svg>
    <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" {...trazo} />
  </Svg>
);

export const IconoLlave = () => (
  <Svg>
    <path d="M14 10a4 4 0 1 0-3.9 4H11v2h2v2h3v-3l-2.1-2.1A4 4 0 0 0 14 10Z" {...trazo} />
  </Svg>
);

export const IconoBuscar = ({ tamano = 16 }) => (
  <Svg tamano={tamano}>
    <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4" {...trazo} />
  </Svg>
);

export const IconoInfo = () => (
  <Svg tamano={18}>
    <circle cx="12" cy="12" r="9" {...trazo} />
    <path d="M12 11v5M12 8h.01" {...trazo} />
  </Svg>
);

/**
 * Acción secundaria de una fila: botón cuadrado de 32 px con ícono.
 * `nombre` es lo que se lee (title y aria-label). Con `href` es un enlace
 * (p. ej. "tel:" para llamar). `peligro`: en rojo (cancelar, retirar).
 */
export function BotonIcono({ nombre, href, peligro = false, children, ...props }) {
  const clase = `boton-icono ${peligro ? "boton-icono--peligro" : ""}`;
  if (href) {
    return (
      <a className={clase} href={href} title={nombre} aria-label={nombre}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={clase} title={nombre} aria-label={nombre} {...props}>
      {children}
    </button>
  );
}
