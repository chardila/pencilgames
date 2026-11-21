import { expect, test, type Page } from '@playwright/test';
import { suiteActiva } from './seleccion';

test.skip(!suiteActiva('juegos'), 'suite juegos no seleccionada');

async function arrancarSolo(page: Page, slug: string, dificultad: 'facil' | 'medio' | 'dificil' = 'facil') {
  await page.goto(`/juegos/${slug}/`);
  await page.locator('#modal-instrucciones-cerrar').click();
  await page.locator('#modal-modo-juego-solo').click();
  await page.locator(`.modal-modo-juego__dificultad[data-dificultad="${dificultad}"]`).click();
  await page.locator('#tablero-juego').waitFor({ state: 'visible' });
}

test('tres-en-raya: bot responde, Deshacer revierte ambos turnos, cambiar dificultad y revancha alternada', async ({
  page,
}) => {
  const errores: string[] = [];
  page.on('console', m => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', e => errores.push(e.message));

  await arrancarSolo(page, 'tres-en-raya', 'facil');
  await expect(page.locator('#boton-dificultad-solo')).toContainText('Fácil');

  // Primera jugada del niño -> el robot responde automáticamente tras ~500 ms.
  await page.locator('#tablero .casilla').nth(0).click();
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(2, { timeout: 3000 });

  // Deshacer revierte la jugada del robot y la del niño en un toque.
  await page.locator('#control-deshacer').click();
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(0);

  // Cambiar dificultad desde cabecera sin perder la partida en curso.
  await page.locator('#tablero .casilla').nth(4).click();
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(2, { timeout: 3000 });
  await page.locator('#boton-dificultad-solo').click();
  await page.locator('#modal-opciones-solo .modal-opciones-solo__nivel[data-dificultad="medio"]').click();
  await expect(page.locator('#boton-dificultad-solo')).toContainText('Medio');
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(2);

  // Jugar hasta terminar la partida (con turnos del bot automáticos) y pulsar Revancha.
  while (await page.locator('#banner-ganador').isHidden()) {
    await expect
      .poll(
        async () =>
          (await page.locator('#banner-ganador').isVisible()) ||
          (await page.locator('#tablero .casilla:not(:disabled)').count()) > 0,
        { timeout: 3000 }
      )
      .toBe(true);
    if (await page.locator('#banner-ganador').isVisible()) break;
    await page.locator('#tablero .casilla:not(:disabled)').first().click();
  }

  await page.locator('#banner-ganador .banner-ganador__reiniciar').click();
  // En la revancha alterna el turno inicial: abre el robot y coloca 1 ficha solo.
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(1, { timeout: 3000 });
  expect(errores).toEqual([]);
});

test('puntos-y-cajas: el robot responde en modo solitario sin errores', async ({ page }) => {
  const errores: string[] = [];
  page.on('console', m => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', e => errores.push(e.message));

  await arrancarSolo(page, 'puntos-y-cajas', 'medio');
  await page.locator('#tablero .linea').first().click();
  await expect(page.locator('#tablero .linea[data-trazada="true"]')).toHaveCount(2, { timeout: 3000 });
  expect(errores).toEqual([]);
});

test('nim: recargar a mitad de partida ofrece Continuar y restaura el modo solitario', async ({ page }) => {
  await arrancarSolo(page, 'nim', 'facil');
  await page.locator('#tablero .estrella').first().click();
  await page.locator('#nim-confirmar').click();
  // Esperar a que responda también el robot (al menos 2 estrellas quitadas) y venza el debounce de 300 ms.
  await expect
    .poll(() => page.locator('#tablero .estrella.estrella--quitada').count(), { timeout: 3000 })
    .toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(450);

  const quitadasAntes = await page.locator('#tablero .estrella.estrella--quitada').count();
  await page.reload();
  await page.locator('#modal-continuar-si').click();
  await page.locator('#tablero-juego').waitFor({ state: 'visible' });

  await expect(page.locator('#boton-dificultad-solo')).toBeVisible();
  await expect(page.locator('#tablero .estrella.estrella--quitada')).toHaveCount(quitadasAntes);
});

test('juego sin bot (hex) con preferencia "solo" guardada muestra Local/Remoto sin errores', async ({
  page,
}) => {
  const errores: string[] = [];
  page.on('console', m => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', e => errores.push(e.message));

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pencilgames:modo', 'solo'));
  await page.goto('/juegos/hex/');
  await page.locator('#modal-instrucciones-cerrar').click();

  await expect(page.locator('#modal-modo-juego')).toBeVisible();
  await expect(page.locator('#modal-modo-juego-solo')).toHaveCount(0);
  await expect(page.locator('#modal-modo-juego-local')).toBeVisible();
  expect(errores).toEqual([]);
});

for (const viewport of [
  { width: 600, height: 960 },
  { width: 960, height: 600 },
]) {
  test(`layout sin desborde y zonas tocables >= 48px a ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/juegos/gomoku/');
    await page.locator('#modal-instrucciones-cerrar').click();
    await page.locator('#modal-modo-juego-solo').click();

    const cajaNivel = await page
      .locator('.modal-modo-juego__dificultad[data-dificultad="facil"]')
      .boundingBox();
    expect(cajaNivel?.height ?? 0).toBeGreaterThanOrEqual(48);

    await page.locator('.modal-modo-juego__dificultad[data-dificultad="facil"]').click();
    await page.locator('#tablero-juego').waitFor({ state: 'visible' });

    const cajaCabecera = await page.locator('#boton-dificultad-solo').boundingBox();
    expect(cajaCabecera?.height ?? 0).toBeGreaterThanOrEqual(48);

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(desborde).toBe(false);
  });
}
