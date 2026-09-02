const COLORES = ["#1B5FA8", "#1F7A4D", "#C77A1F", "#0E7C86", "#7A4FB0", "#B0521F"];

const TITULOS = new Set(["dr", "dr.", "dra", "dra.", "lic", "lic.", "sr", "sr.", "sra", "sra."]);

export function iniciales(nombre) {
  if (!nombre) return "";
  const partes = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => !TITULOS.has(p.toLowerCase()));
  const primeras = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return primeras.join("");
}

/** Color determinístico según el texto (mismo nombre = mismo color siempre). */
export function colorAvatar(texto) {
  if (!texto) return COLORES[0];
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORES[Math.abs(hash) % COLORES.length];
}
