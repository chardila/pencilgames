// Invitación a instalar la PWA (spec 10 R6). Se muestra una sola vez: la
// clave se marca al descartar, al aceptar o al instalarse. Si localStorage no
// responde (modo privado) se cuenta como visto: sin poder recordar, el aviso
// reaparecería en cada visita.

export const CLAVE_INSTALAR_VISTO = 'pencilgames:instalar-visto';

export function instalarVisto(): boolean {
  try {
    return localStorage.getItem(CLAVE_INSTALAR_VISTO) === '1';
  } catch {
    return true;
  }
}

export function marcarInstalarVisto(): void {
  try {
    localStorage.setItem(CLAVE_INSTALAR_VISTO, '1');
  } catch {
    // Sin almacenamiento: no persiste, no rompe.
  }
}

export function debeMostrarAviso(o: { visto: boolean; standalone: boolean }): boolean {
  return !o.visto && !o.standalone;
}

// Texto de ayuda para quien no recibe `beforeinstallprompt` (Safari de iOS,
// Firefox, etc.): ahí no hay botón de instalar y el camino manual depende del
// navegador. iPadOS moderno se anuncia como Mac, de ahí la comprobación táctil.
export function ayudaManual(o: { userAgent: string; puntosTactiles: number }): string {
  const esIOS =
    /iPad|iPhone|iPod/.test(o.userAgent) || (/Macintosh/.test(o.userAgent) && o.puntosTactiles > 1);
  return esIOS
    ? 'Toca el botón Compartir y elige «Añadir a pantalla de inicio».'
    : 'Abre el menú del navegador y elige «Instalar» o «Añadir a pantalla de inicio».';
}
