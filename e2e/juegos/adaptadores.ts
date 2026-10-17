import type { Page } from '@playwright/test';

export interface Adaptador {
  /** Hace una jugada legal en la partida recién arrancada. */
  jugar(page: Page): Promise<void>;
  /** Cadena que cambia cuando el estado observable de la partida cambia. */
  huella(page: Page): Promise<string>;
}

const CANDIDATOS = [
  '[data-indice]:not([data-ocupada="true"])',
  '[data-pos]',
  'button.casilla',
  '[role="gridcell"]',
].join(', ');

function generico(slug: string): Adaptador {
  return {
    async jugar(page) {
      const candidato = page.locator(`#tablero-juego :is(${CANDIDATOS})`).first();
      if ((await candidato.count()) === 0) throw new Error(`juego ${slug} sin adaptador e2e`);
      await candidato.click();
    },
    huella: page => page.locator('#tablero-juego').innerHTML(),
  };
}

const huellaDelTablero = (page: Page) => page.locator('#tablero-juego').innerHTML();

/** Adaptador que hace clic en el primer elemento que coincide con `selector`. */
function clicEn(
  selector: string,
  antes?: (page: Page) => Promise<void>,
  opciones?: { force?: boolean },
): Adaptador {
  return {
    async jugar(page) {
      await antes?.(page);
      await page.locator(`#tablero-juego ${selector}`).first().click(opciones);
    },
    huella: huellaDelTablero,
  };
}

// Juegos cuyo marcado no cubre el adaptador genérico.
const ESPECIFICOS: Record<string, Adaptador> = {
  'agujero-negro': clicEn('.posicion-an'),
  'bridg-it': clicEn('button[data-slot]'),
  'puntos-y-cajas': clicEn('button[data-tipo]'),
  conquista: clicEn('[data-interactivo="true"]'),
  triggle: clicEn('.punto .punto__halo'),
  // Los destinos legales pulsan (animación infinita): nunca están «estables».
  snakes: clicEn('.snakes-grupo[data-destino="true"] .snakes-punto', undefined, { force: true }),
  chomp: clicEn('button[data-indice]:last-of-type'),
  // Primero hay que elegir un mapa; después, una región.
  col: clicEn('.col-region', async page => {
    const mapa = page.locator('.col-selector__mapa').first();
    if (await mapa.isVisible()) await mapa.click();
    await page.locator('.col-region').first().waitFor();
  }),
  // Colocación de flota: «Empezar» y «Barajar» cambian el tablero.
  battleship: {
    async jugar(page) {
      const empezar = page.locator('#empezar');
      if (await empezar.isVisible()) await empezar.click();
      await page.locator('#barajar').click();
    },
    huella: huellaDelTablero,
  },
};

export function adaptadorDe(slug: string): Adaptador {
  return ESPECIFICOS[slug] ?? generico(slug);
}
