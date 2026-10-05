// Contraste WCAG 2.x entre dos colores #rrggbb. Solo lo usan las pruebas de
// paleta; vive en lib/ para poder reutilizarlo si se añade otro tema.

function canal(hex: string, inicio: number): number {
  const v = parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hex: string): number {
  return 0.2126 * canal(hex, 1) + 0.7152 * canal(hex, 3) + 0.0722 * canal(hex, 5);
}

export function contraste(a: string, b: string): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
