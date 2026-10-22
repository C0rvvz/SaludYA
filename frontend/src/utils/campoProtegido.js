/**
 * RNF-16 (HU-90): en los campos del ingreso (documento, código, correo y
 * contraseña) no se puede copiar, cortar, pegar ni arrastrar texto, ni
 * seleccionarlo, ni abrir el menú del clic derecho: el dato se escribe a
 * mano. Así no queda en el portapapeles (donde otro programa podría leerlo)
 * ni se puede pegar uno robado o una lista de intentos automáticos.
 *
 * El control de fondo sigue en el servidor (código por WhatsApp, contraseña,
 * límite de intentos); esto cierra la puerta en la pantalla.
 */

export const MENSAJE_CAMPO_PROTEGIDO = "Por seguridad, escriba el dato a mano: aquí no se puede copiar ni pegar.";

/** Props para un <input> del ingreso. `avisar(mensaje)` explica por qué no se pudo pegar. */
export function propsCampoProtegido(avisar) {
  const bloquear = (evento) => {
    evento.preventDefault();
    avisar(MENSAJE_CAMPO_PROTEGIDO);
  };
  return {
    onCopy: bloquear,
    onCut: bloquear,
    onPaste: bloquear,
    onDrop: bloquear,
    onDragStart: (evento) => evento.preventDefault(),
    onContextMenu: (evento) => evento.preventDefault(),
    // Si se marca texto (doble clic, Mayús + flechas, Ctrl + A), queda solo el cursor al final.
    onSelect: (evento) => {
      const campo = evento.target;
      if (campo.selectionStart !== campo.selectionEnd) campo.setSelectionRange(campo.selectionEnd, campo.selectionEnd);
    },
    // Sin sugerencias del navegador ni del teclado del celular: el dato no se guarda en el equipo.
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
  };
}

/** Props para el contenedor de la pantalla de ingreso: nada de su texto se puede copiar. */
export const propsPantallaProtegida = {
  onCopy: (evento) => evento.preventDefault(),
  onCut: (evento) => evento.preventDefault(),
  onContextMenu: (evento) => evento.preventDefault(),
  onDragStart: (evento) => evento.preventDefault(),
};
