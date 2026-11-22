import { expect, test } from '@playwright/test';
import { slugsDelCatalogo } from './catalogo';
import { suiteActiva } from './seleccion';

test.skip(!suiteActiva('portada'), 'suite portada no seleccionada');

const TARJETAS = '#grid-juegos .indice__item:not([hidden])';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('muestra una tarjeta por juego del catálogo', async ({ page }) => {
  await expect(page.locator(TARJETAS)).toHaveCount(slugsDelCatalogo().length);
});

test('el buscador filtra por texto', async ({ page }) => {
  await page.locator('#buscador').fill('hex');
  await expect(page.locator('.indice__item[data-slug="hex"]')).toBeVisible();
  const visibles = await page.locator(TARJETAS).count();
  expect(visibles).toBeGreaterThan(0);
  expect(visibles).toBeLessThan(slugsDelCatalogo().length);
});

test('sin resultados, «Limpiar filtros» devuelve el foco al buscador con teclado', async ({ page }) => {
  await page.locator('#buscador').fill('zzzzzz');
  await expect(page.locator('#sin-resultados')).toBeVisible();
  await expect(page.locator(TARJETAS)).toHaveCount(0);

  await page.locator('#limpiar-filtros').focus();
  await page.keyboard.press('Enter');

  await expect(page.locator(TARJETAS)).toHaveCount(slugsDelCatalogo().length);
  await expect(page.locator('#buscador')).toBeFocused();
});

test('un filtro reduce la lista', async ({ page }) => {
  const filtro = page.locator('.filtro[data-valor]').first();
  await filtro.click();
  await expect(filtro).toHaveAttribute('aria-pressed', 'true');
  const visibles = await page.locator(TARJETAS).count();
  expect(visibles).toBeLessThan(slugsDelCatalogo().length);
});

test('todos los juegos del catálogo muestran la etiqueta 1 jugador', async ({ page }) => {
  const slugs = slugsDelCatalogo();
  expect(slugs).toHaveLength(27);
  for (const slug of slugs) {
    await expect(page.locator(`.indice__item[data-slug="${slug}"]`)).toContainText('1 jugador');
  }
});

test('el filtro "Jugar solo" deja todos los juegos del catálogo (27)', async ({ page }) => {
  const slugs = slugsDelCatalogo();
  expect(slugs).toHaveLength(27);
  await page.locator('[data-grupo="jugadores"] .filtro[data-valor="solo"]').click();
  await expect(page.locator(TARJETAS)).toHaveCount(slugs.length);
  for (const slug of slugs) {
    await expect(page.locator(`.indice__item[data-slug="${slug}"]`)).toBeVisible();
  }
});

test('clic en una tarjeta navega al juego', async ({ page }) => {
  await page.locator('.indice__item[data-slug="hex"] a').click();
  await expect(page).toHaveURL(/\/juegos\/hex\/?$/);
});

test('registra el service worker', async ({ page }) => {
  const activo = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
  expect(activo).toBe(true);
});

test('no hay errores de consola', async ({ page }) => {
  const errores: string[] = [];
  page.on('console', m => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', e => errores.push(e.message));
  await page.reload();
  await expect(page.locator(TARJETAS).first()).toBeVisible();
  expect(errores).toEqual([]);
});
