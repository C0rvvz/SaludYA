import { esProfesionalMujer } from "../../utils/agendar";

/**
 * Foto del profesional. Mientras no haya fotos reales, la silueta genérica
 * del diseño: mujer (cabello largo) para "Dra." y hombre (cabello corto y
 * cuello en V) para los demás.
 */
export default function FotoProfesional({ nombre, tamano = 52 }) {
  const mujer = esProfesionalMujer(nombre);
  return (
    <span className="foto-profesional" style={{ width: tamano, height: tamano }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={tamano} height={tamano} fill="none">
        {mujer ? (
          <>
            <path d="M11.5 22c0-9 3.5-14 8.5-14s8.5 5 8.5 14c0 2.5-1 4-2.5 5h-12c-1.5-1-2.5-2.5-2.5-5Z" fill="#fff" />
            <circle cx="20" cy="16" r="6.4" fill="#e3e7eb" />
            <path d="M13.5 15c1.5-4 4-5.5 6.5-5.5s5 1.5 6.5 5.5c-2-1.6-4.2-2.4-6.5-2.4s-4.5.8-6.5 2.4Z" fill="#fff" />
            <path d="M6 40c0-8.5 6.3-13.5 14-13.5S34 31.5 34 40Z" fill="#fff" />
          </>
        ) : (
          <>
            <circle cx="20" cy="16.5" r="6.6" fill="#e3e7eb" />
            <path
              d="M13.2 16c-.4-5 2.6-8.2 6.8-8.2s7.2 3.2 6.8 8.2c-.6-2.2-2-3.4-3.6-3.9-1.8 1.2-4.8 1.6-8 .9-1 .6-1.7 1.6-2 3Z"
              fill="#fff"
            />
            <path d="M6 40c0-8.5 6.3-13.5 14-13.5S34 31.5 34 40Z" fill="#fff" />
            <path d="M16.5 27.2 20 31l3.5-3.8" stroke="#c9d0d8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
    </span>
  );
}
