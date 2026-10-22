// Abre a Eli desde cualquier botón de las páginas del paciente
// ("¿No sabe cuál? Pregúntele a Eli"). La escucha EncabezadoPaciente.
export const EVENTO_ABRIR_ELI = "saludya:abrir-eli";

export const abrirEli = () => window.dispatchEvent(new Event(EVENTO_ABRIR_ELI));
