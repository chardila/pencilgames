// Tema claro/oscuro (spec 10). 'auto' sigue al sistema (prefers-color-scheme)
// y es el valor por omisión: se guarda borrando la clave. Mismo patrón de
// try/catch silencioso que recientes.ts: sin localStorage no persiste, no rompe.
//
// BaseLayout.astro tiene un script inline que repite la lectura de la clave y
// los dos colores de la barra para evitar el destello antes de que cargue este
// módulo; paleta.test.ts comprueba que no se desincronicen.

export type Tema = 'auto' | 'claro' | 'oscuro';

export const CLAVE_TEMA = 'pencilgames:tema';
export const TEMAS: readonly Tema[] = ['auto', 'claro', 'oscuro'];
export const COLOR_BARRA = { claro: '#fdf6ec', oscuro: '#1b1814' } as const;

export function esTema(v: unknown): v is Tema {
  return v === 'auto' || v === 'claro' || v === 'oscuro';
}

export function obtenerTema(): Tema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    return esTema(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function guardarTema(t: Tema): void {
  try {
    if (t === 'auto') localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, t);
  } catch {
    // Sin almacenamiento: el tema se aplica en esta visita pero no se recuerda.
  }
}

export function siguienteTema(t: Tema): Tema {
  return TEMAS[(TEMAS.indexOf(t) + 1) % TEMAS.length];
}

export interface RaizTema {
  setAttribute(nombre: string, valor: string): void;
  removeAttribute(nombre: string): void;
}

export interface MetaColor {
  content: string;
  dataset: { esquema?: string };
}

// Cada <meta name="theme-color"> lleva data-esquema="claro|oscuro" y un media
// que la activa según el sistema. Con tema forzado se igualan las dos al color
// forzado; en auto cada una recupera el suyo.
export function aplicarTema(t: Tema, raiz: RaizTema, metas: Iterable<MetaColor>): void {
  if (t === 'auto') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', t);
  for (const meta of metas) {
    const esquema = t === 'auto' ? meta.dataset.esquema : t;
    if (esquema === 'claro' || esquema === 'oscuro') meta.content = COLOR_BARRA[esquema];
  }
}
