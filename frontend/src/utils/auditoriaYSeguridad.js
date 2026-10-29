/**
 * Las pestañas de "Auditoría y seguridad" (una sola entrada del menú): cada
 * una es su propia dirección y solo aparece si el rol tiene el permiso. Las
 * usan el menú (AdminLayout) y el encabezado de las dos páginas.
 */
export const PESTANAS_AUDITORIA = [
  { to: "/admin/auditoria", texto: "Auditoría", detalle: "Acciones sobre citas y cuentas", permiso: "ver_auditoria" },
  { to: "/admin/seguridad", texto: "Seguridad", detalle: "Accesos, alertas y sesiones", permiso: "seguridad" },
];
