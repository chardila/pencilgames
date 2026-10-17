import { slugsDelCatalogo } from './catalogo';

export type Suite = 'portada' | 'juegos' | 'remoto';

function lista(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** `E2E_SUITES` vacío o `todas` ⇒ todas las suites. */
export function suiteActiva(nombre: Suite): boolean {
  const suites = lista(process.env.E2E_SUITES);
  return suites.length === 0 || suites.includes('todas') || suites.includes(nombre);
}

/** `E2E_SLUGS` vacío ⇒ todo el catálogo. Los slugs que no están en el catálogo se ignoran. */
export function slugsActivos(): string[] {
  const catalogo = slugsDelCatalogo();
  const pedidos = lista(process.env.E2E_SLUGS);
  return pedidos.length === 0 ? catalogo : catalogo.filter(slug => pedidos.includes(slug));
}
