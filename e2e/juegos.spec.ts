import { expect, test } from '@playwright/test';
import { adaptadorDe } from './juegos/adaptadores';
import { arrancarPartidaLocal } from './juegos/arranque';
import { suiteActiva, slugsActivos } from './seleccion';

test.skip(!suiteActiva('juegos'), 'suite juegos no seleccionada');

for (const slug of slugsActivos()) {
  test(`${slug}: carga, muestra el tablero y acepta una jugada`, async ({ page }) => {
    const problemas: string[] = [];
    page.on('console', m => m.type() === 'error' && problemas.push(`consola: ${m.text()}`));
    page.on('pageerror', e => problemas.push(`excepción: ${e.message}`));
    page.on('response', r => {
      if (r.status() >= 400 && r.url().startsWith('http://localhost')) {
        problemas.push(`${r.status()} ${r.url()}`);
      }
    });

    await page.goto(`/juegos/${slug}/`);
    await arrancarPartidaLocal(page);

    await expect(page.locator('#tablero-juego')).toBeVisible();
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(desborde, 'la página no debe desbordar en horizontal').toBe(false);

    const adaptador = adaptadorDe(slug);
    const antes = await adaptador.huella(page);
    await adaptador.jugar(page);
    await expect.poll(() => adaptador.huella(page)).not.toBe(antes);

    expect(problemas).toEqual([]);
  });
}

if (slugsActivos().includes('tres-en-raya')) {
  test('tres-en-raya: modal «Tienes una partida a medias» restaura al continuar y limpia al empezar de nuevo', async ({
    page,
  }) => {
    await page.goto('/juegos/tres-en-raya/');
    await arrancarPartidaLocal(page);

    const adaptador = adaptadorDe('tres-en-raya');
    const huellaInicial = await adaptador.huella(page);
    await adaptador.jugar(page);
    await expect.poll(() => adaptador.huella(page)).not.toBe(huellaInicial);
    const huellaJugada = await adaptador.huella(page);

    // Esperar a que venza el debounce de guardado (300 ms).
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('pencilgames:partida:tres-en-raya')))
      .not.toBeNull();

    await page.reload();
    await expect(page.locator('#modal-continuar-partida')).toBeVisible();
    await page.locator('#modal-continuar-si').click();
    await expect(page.locator('#tablero-juego')).toBeVisible();
    await expect.poll(() => adaptador.huella(page)).toBe(huellaJugada);

    await page.reload();
    await expect(page.locator('#modal-continuar-partida')).toBeVisible();
    await arrancarPartidaLocal(page);
    await expect.poll(() => adaptador.huella(page)).toBe(huellaInicial);
  });
}

if (slugsActivos().includes('battleship')) {
  test('battleship: el aviso de relevo no mueve el tablero en modo local', async ({ page }) => {
    await page.goto('/juegos/battleship/');
    await arrancarPartidaLocal(page);

    // Colocación de flotas de ambos jugadores.
    await page.locator('#empezar').click();
    await page.locator('#confirmar').click();
    await page.locator('#empezar').click();
    await page.locator('#confirmar').click();

    const primeraCasilla = page.locator('#tablero .casilla').first();
    await expect(primeraCasilla).toBeEnabled();
    await primeraCasilla.scrollIntoViewIfNeeded();
    const antes = await page.locator('#zona-tablero').boundingBox();
    expect(antes).not.toBeNull();

    await primeraCasilla.click();
    await expect(page.locator('#handoff')).toBeVisible();
    const duranteHandoff = await page.locator('#zona-tablero').boundingBox();
    expect(duranteHandoff?.y).toBe(antes!.y);

    await page.locator('#handoff-continuar').click();
    await expect(page.locator('#handoff')).toBeHidden();
    const despues = await page.locator('#zona-tablero').boundingBox();
    expect(despues?.y).toBe(antes!.y);
  });
}
