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
