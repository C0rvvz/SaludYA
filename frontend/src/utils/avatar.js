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
