import { expect, test, type Page } from '@playwright/test';
import { suiteActiva } from './seleccion';

test.skip(!suiteActiva('remoto'), 'suite remoto no seleccionada');

function escucharErrores(page: Page, etiqueta: string, lista: string[]): void {
  page.on('console', m => m.type() === 'error' && lista.push(`[${etiqueta}] consola: ${m.text()}`));
  page.on('pageerror', e => lista.push(`[${etiqueta}] excepción: ${e.message}`));
}

test('tres-en-raya: crear sala, validar nombre duplicado, jugar partida completa entre dos navegadores y revancha', async ({
  browser,
}) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();
  const errores: string[] = [];
  escucharErrores(page1, 'J1', errores);
  escucharErrores(page2, 'J2', errores);

  try {
    // Jugador 1 crea la sala desde el modal de instrucciones.
    await page1.goto('/juegos/tres-en-raya/');
    await page1.locator('#modal-instrucciones-remoto').click();
    await page1.locator('#modal-remoto-input-nombre').fill('Ana');
    await page1.locator('#modal-remoto-crear').click();

    const codigoEl = page1.locator('#modal-remoto-codigo');
    await expect(codigoEl).toHaveText(/^[A-Z2-9]{6}$/, { timeout: 10_000 });
    const codigo = (await codigoEl.textContent())!.trim();

    // Jugador 2 entra por deep-link (?sala=CODIGO), prueba nombre duplicado y corrige.
    await page2.goto(`/juegos/tres-en-raya/?sala=${codigo}`);
    await page2.locator('#modal-remoto-input-nombre').fill('Ana');
    await page2.locator('#modal-remoto-confirmar-unirse').click();
    await expect(page2.locator('#modal-remoto-error')).toBeVisible();
    await expect(page2.locator('#modal-remoto-error')).toContainText(
      'Ese nombre ya lo tiene el otro jugador',
    );

    await page2.locator('#modal-remoto-input-nombre').fill('Beto');
    await page2.locator('#modal-remoto-confirmar-unirse').click();

    // Ambos ven el tablero, los dos nombres y las restricciones de turno/Deshacer.
    await expect(page1.locator('#tablero-juego')).toBeVisible({ timeout: 15_000 });
    await expect(page2.locator('#tablero-juego')).toBeVisible({ timeout: 15_000 });
    await expect(page1.locator('#indicador-turno')).toContainText('Ana', { timeout: 15_000 });
    await expect(page1.locator('#indicador-turno')).toContainText('Beto', { timeout: 15_000 });
    await expect(page2.locator('#indicador-turno')).toContainText('Ana', { timeout: 15_000 });
    await expect(page2.locator('#indicador-turno')).toContainText('Beto', { timeout: 15_000 });
    await expect(page1.locator('#control-deshacer')).toBeHidden();
    await expect(page2.locator('#control-deshacer')).toBeHidden();

    await expect(page1.locator('#tablero .casilla').nth(0)).toBeEnabled();
    await expect(page2.locator('#tablero .casilla').nth(0)).toBeDisabled();

    // Partida completa (5 jugadas: Ana alinea fila superior 0-1-2).
    const jugadas: Array<[Page, Page, number, 'X' | 'O']> = [
      [page1, page2, 0, 'X'],
      [page2, page1, 3, 'O'],
      [page1, page2, 1, 'X'],
      [page2, page1, 4, 'O'],
      [page1, page2, 2, 'X'],
    ];

    for (const [emisor, receptor, indice, marca] of jugadas) {
      await emisor.locator('#tablero .casilla').nth(indice).click();
      await expect(receptor.locator('#tablero .casilla').nth(indice)).toHaveAttribute(
        'data-valor',
        marca,
      );
    }

    await expect(page1.locator('#banner-ganador')).toBeVisible();
    await expect(page1.locator('#banner-ganador')).toContainText('¡Ganó Ana');
    await expect(page2.locator('#banner-ganador')).toBeVisible();
    await expect(page2.locator('#banner-ganador')).toContainText('¡Ganó Ana');

    // Revancha iniciada desde el segundo jugador limpia ambos tableros.
    await page2.locator('#banner-ganador .banner-ganador__reiniciar').click();
    await expect(page1.locator('#banner-ganador')).toBeHidden();
    await expect(page2.locator('#banner-ganador')).toBeHidden();
    await expect(page1.locator('#tablero .casilla[data-valor]')).toHaveCount(0);
    await expect(page2.locator('#tablero .casilla[data-valor]')).toHaveCount(0);

    expect(errores).toEqual([]);
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

test('modal remoto: muestra error al intentar unirse con un código inexistente', async ({
  page,
}) => {
  await page.goto('/juegos/tres-en-raya/');
  await page.locator('#modal-instrucciones-remoto').click();
  await page.locator('#modal-remoto-mostrar-unirse').click();
  await page.locator('#modal-remoto-input-nombre').fill('Carlos');
  await page.locator('#modal-remoto-input-codigo').fill('ZZZZZZ');
  await page.locator('#modal-remoto-confirmar-unirse').click();

  await expect(page.locator('#modal-remoto-error')).toBeVisible();
  await expect(page.locator('#modal-remoto-error')).toContainText('Ese código no es válido');
});
