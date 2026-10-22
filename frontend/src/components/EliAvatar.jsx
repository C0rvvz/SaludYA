/**
 * Eli, la guía de SaludYA (el nombre viene de Elizabeth Blackwell, la
 * primera médica graduada en Estados Unidos): una doctora con gorro y cruz
 * azul. `tamano` en píxeles; `grande` le pone el borde blanco ancho y la
 * sombra del registro.
 */
export default function EliAvatar({ tamano = 46, grande = false }) {
  return (
    <span
      className={`eli-avatar ${grande ? "eli-avatar--grande" : ""}`}
      style={{ width: tamano, height: tamano }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" fill="none">
        <path d="M10 48c1.5-8 7-11.5 14-11.5S36.5 40 38 48Z" fill="#fff" />
        <path d="M20 37.5 24 42l4-4.5" stroke="#1b5fa8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.5 24c0-9 5.5-14.5 12.5-14.5S36.5 15 36.5 24c0 1.5-.5 3.5-1.5 5" fill="#5a3a2a" />
        <circle cx="24" cy="25" r="10.5" fill="#f6d4bd" />
        <path d="M13.6 21.5c2-4.5 6-6 10.4-6s8.4 1.5 10.4 6c-3-1.5-6.5-2.3-10.4-2.3s-7.4.8-10.4 2.3Z" fill="#5a3a2a" />
        <path d="M14 17.5c0-4.5 4.5-8 10-8s10 3.5 10 8c-3-1.3-6.4-2-10-2s-7 .7-10 2Z" fill="#fff" />
        <rect x="22.6" y="10.6" width="2.8" height="7" rx="1.2" fill="#1b5fa8" />
        <rect x="20.5" y="12.7" width="7" height="2.8" rx="1.2" fill="#1b5fa8" />
        <ellipse cx="20" cy="25.5" rx="1.6" ry="2" fill="#0e1f39" />
        <ellipse cx="28" cy="25.5" rx="1.6" ry="2" fill="#0e1f39" />
        <circle cx="20.6" cy="24.8" r=".55" fill="#fff" />
        <circle cx="28.6" cy="24.8" r=".55" fill="#fff" />
        <ellipse cx="17.2" cy="29" rx="2" ry="1.2" fill="#f2a7a0" opacity=".8" />
        <ellipse cx="30.8" cy="29" rx="2" ry="1.2" fill="#f2a7a0" opacity=".8" />
        <path d="M21.5 29.6q2.5 2.4 5 0" stroke="#0e1f39" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
