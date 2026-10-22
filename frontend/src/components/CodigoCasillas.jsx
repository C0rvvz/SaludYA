/**
 * El código de 6 dígitos en 6 casillas grandes. Por dentro es UN solo
 * campo (invisible, encima de las casillas): así funciona con el teclado
 * numérico del celular, con lectores de pantalla y con la protección del
 * ingreso (RNF-16: no se puede pegar ni seleccionar).
 */
export default function CodigoCasillas({ id, valor, onCambio, error, props: extra }) {
  const digitos = valor.padEnd(6, " ").slice(0, 6).split("");
  const activa = Math.min(valor.length, 5);

  return (
    <div className={`codigo-casillas ${error ? "has-error" : ""}`}>
      <input
        id={id}
        className="codigo-casillas__campo"
        type="text"
        inputMode="numeric"
        maxLength={6}
        aria-invalid={Boolean(error)}
        placeholder="000000"
        {...extra}
        value={valor}
        onChange={(e) => onCambio(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <div className="codigo-casillas__fila" aria-hidden="true">
        {digitos.map((d, i) => (
          <span
            key={i}
            className={`codigo-casillas__casilla ${d.trim() ? "is-llena" : ""} ${i === activa ? "is-activa" : ""}`}
          >
            {d.trim()}
          </span>
        ))}
      </div>
    </div>
  );
}
