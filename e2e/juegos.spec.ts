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
