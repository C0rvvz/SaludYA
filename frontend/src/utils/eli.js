// Abre a Eli desde cualquier botón de las páginas del paciente (p. ej.
// "pregúntele a Eli" cuando la búsqueda de Agendar no encuentra nada). La escucha EncabezadoPaciente.
export const EVENTO_ABRIR_ELI = "saludya:abrir-eli";

export const abrirEli = () => window.dispatchEvent(new Event(EVENTO_ABRIR_ELI));
