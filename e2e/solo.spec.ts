import { expect, test, type Page } from '@playwright/test';
import { suiteActiva } from './seleccion';

test.skip(!suiteActiva('juegos'), 'suite juegos no seleccionada');

function escucharErrores(page: Page): string[] {
  const errores: string[] = [];
  page.on('console', m => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', e => errores.push(e.message));
  return errores;
}

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
  const errores = escucharErrores(page);

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

test('col: selector de mapa en solitario, respuesta del bot y revancha alternada', async ({
  page,
}) => {
  const errores = escucharErrores(page);

  await arrancarSolo(page, 'col', 'facil');
  await expect(page.locator('#col-selector')).toBeVisible();
  await page.locator('.col-selector__mapa').first().click();
  await expect(page.locator('#col-tablero')).toBeVisible();

  await page.locator('#col-svg .col-region--legal').first().click();
  await expect(page.locator('#col-svg .col-region--j1, #col-svg .col-region--j2')).toHaveCount(2, {
    timeout: 3000,
  });

  // Jugar hasta terminar la partida y pulsar Revancha.
  while (await page.locator('#banner-ganador').isHidden()) {
    await expect
      .poll(
        async () =>
          (await page.locator('#banner-ganador').isVisible()) ||
          (await page.locator('#col-svg .col-region--legal').count()) > 0,
        { timeout: 3000 }
      )
      .toBe(true);
    if (await page.locator('#banner-ganador').isVisible()) break;
    await page.locator('#col-svg .col-region--legal').first().click();
  }

  await page.locator('#banner-ganador .banner-ganador__reiniciar').click();
  // En revancha alternada el niño vuelve a elegir mapa, y luego abre el robot coloreando como J1.
  await expect(page.locator('#col-selector')).toBeVisible();
  await page.locator('.col-selector__mapa').first().click();
  await expect(page.locator('#col-tablero')).toBeVisible();
  await expect(page.locator('#col-svg .col-region--j1')).toHaveCount(1, { timeout: 3000 });
  expect(errores).toEqual([]);
});

test('hex: cambiar tamaño a 5x5 antes de jugar en solitario y respuesta del bot', async ({
  page,
}) => {
  const errores = escucharErrores(page);

  await arrancarSolo(page, 'hex', 'facil');
  const btn5 = page.locator('.btn-tamano[data-tamano="5"]');
  await btn5.click();
  await expect(btn5).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#hex-svg .hex-grupo-celda')).toHaveCount(25);

  await page.locator('#hex-svg .hex-grupo-celda').nth(12).click();
  await expect(page.locator('#hex-svg .hex-celda[data-ocupada="true"]')).toHaveCount(2, {
    timeout: 3000,
  });
  await expect(btn5).toBeDisabled();
  expect(errores).toEqual([]);
});

test('battleship: confirmar flota, disparar y recibir respuesta del bot sin handoff', async ({
  page,
}) => {
  const errores = escucharErrores(page);

  await arrancarSolo(page, 'battleship', 'facil');
  await page.locator('#empezar').click();
  await page.locator('#confirmar').click();

  // Esperar a que el bot coloque su flota y se habiliten las casillas para disparar.
  await expect
    .poll(() => page.locator('#tablero .casilla:not(:disabled)').count(), { timeout: 3000 })
    .toBe(64);
  await expect(page.locator('#handoff')).toBeHidden();

  await page.locator('#tablero .casilla:not(:disabled)').first().click();
  await expect(page.locator('#handoff')).toBeHidden();
  await expect(page.locator('#mensaje-disparo')).toContainText('Te dispararon en ', {
    timeout: 3000,
  });
  await expect(page.locator('#handoff')).toBeHidden();
  expect(errores).toEqual([]);
});

test('gatos-salvajes: elección, revelación y revancha como J2 mantiene revelación cuando el bot elige como J1', async ({
  page,
}) => {
  const errores = escucharErrores(page);

  await arrancarSolo(page, 'gatos-salvajes', 'facil');

  // Ronda 1 (niño como J1): elegir, confirmar y ver revelación sin velo pass-and-play.
  await page.locator('#tablero .casilla:not(:disabled)').first().click();
  await page.locator('#wc-confirmar').click();
  await expect(page.locator('#wc-revelacion')).toHaveText(/.+/, { timeout: 3000 });
  await expect(page.locator('#wc-velo')).toBeHidden();

  // Completar la partida (intentando formar línea en fila 0 cuando esté libre) para ir a revancha.
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

    let elegida = false;
    for (const idx of [0, 1, 2, 3]) {
      const casilla = page.locator(`#tablero .casilla[data-indice="${idx}"]`);
      if (await casilla.isEnabled()) {
        await casilla.click();
        elegida = true;
        break;
      }
    }
    if (!elegida) {
      await page.locator('#tablero .casilla:not(:disabled)').first().click();
    }
    await page.locator('#wc-confirmar').click();
  }

  // Revancha: ahora el niño juega como J2 y el robot elige primero en secreto como J1.
  await page.locator('#banner-ganador .banner-ganador__reiniciar').click();
  await expect(page.locator('#indicador-turno')).toContainText('Tu rival ya eligió', {
    timeout: 3000,
  });

  await page.locator('#tablero .casilla:not(:disabled)').first().click();
  await page.locator('#wc-confirmar').click();

  // Tras resolver la ronda 1 como J2, aparece la revelación y empieza la ronda 2 (bot como J1).
  await expect(page.locator('#wc-revelacion')).toHaveText(/.+/);
  const revelacionRonda1 = await page.locator('#wc-revelacion').textContent();

  // El robot elige en secreto como J1 tras ~500 ms: el turno vuelve a J2 ("Tu rival ya eligió")
  // y la revelación de la ronda anterior debe permanecer intacta.
  await expect(page.locator('#indicador-turno')).toContainText('Tu rival ya eligió', {
    timeout: 3000,
  });
  await expect(page.locator('#wc-revelacion')).toHaveText(revelacionRonda1!);
  expect(errores).toEqual([]);
});

test('puntos-caminantes: jugada y pase con respuesta del bot sin errores de consola', async ({
  page,
}) => {
  const errores = escucharErrores(page);

  await arrancarSolo(page, 'puntos-caminantes', 'facil');
  await page.locator('#tablero .casilla:not(:disabled)').first().click();
  await expect(page.locator('#tablero .casilla[data-valor="2"]')).toHaveCount(2, {
    timeout: 3000,
  });

  await page.locator('#wd-pasar').click();
  await expect
    .poll(
      async () =>
        (await page.locator('#banner-ganador').isVisible()) ||
        (await page.locator('#tablero .casilla:not(:disabled)').count()) > 0,
      { timeout: 3000 }
    )
    .toBe(true);
  expect(errores).toEqual([]);
});

for (const viewport of [
  { width: 600, height: 960 },
  { width: 960, height: 600 },
]) {
  test(`layout sin desborde, 0 errores y zonas tocables >= 48px a ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const errores = escucharErrores(page);
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
    expect(errores).toEqual([]);
  });
}
