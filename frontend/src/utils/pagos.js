// Pago en línea de una cita atendida (simulación de Wompi: no se cobra dinero real).

export const PASOS_PAGO = ["Revisar", "Pagar", "Listo"];

// Solo sirven las tarjetas de prueba de Wompi. Se revisa antes de enviar
// nada, para que el número de una tarjeta real ni siquiera salga del navegador.
export const TARJETAS_DE_PRUEBA = { "4242424242424242": "se aprueba", "4111111111111111": "se rechaza" };

// Mis citas: "Copago de su cita del 15 de octubre con Dra. Gómez."
export function conceptoPendiente(cita) {
  const cuando = `del ${new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long" }).format(
    new Date(`${cita.fecha}T00:00:00`)
  )}`;
  return cita.tipo_cobro === "particular"
    ? `Consulta particular ${cuando} con ${cita.especialista.nombre}.`
    : `Copago de su cita ${cuando} con ${cita.especialista.nombre}.`;
}
