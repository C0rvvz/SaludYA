/**
 * "¿Para qué sirve?": explica en pocas palabras un apartado, para que nadie
 * tenga que entrar a adivinarlo (pensado también para adultos mayores).
 */
export default function AyudaApartado({ titulo = "¿Para qué sirve?", children }) {
  return (
    <aside className="ayuda-apartado" aria-label={titulo}>
      <span className="ayuda-apartado__icono" aria-hidden="true">
        ?
      </span>
      <div>
        <p className="ayuda-apartado__titulo">{titulo}</p>
        {children}
      </div>
    </aside>
  );
}
