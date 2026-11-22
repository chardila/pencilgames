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

test('ninguna tarjeta muestra la etiqueta redundante 1 jugador', async ({ page }) => {
  await expect(page.locator('#grid-juegos')).not.toContainText('1 jugador');
});

test('el filtro "Para qué edad" filtra por edad y permite combinar varias edades', async ({ page }) => {
  const filtro5 = page.locator('[data-grupo="edad"] .filtro[data-valor="5"]');
  const filtro7 = page.locator('[data-grupo="edad"] .filtro[data-valor="7"]');
  const todosEdad = page.locator('[data-grupo="edad"] .filtro[data-todos]');

  await filtro5.click();
  await expect(filtro5).toHaveAttribute('aria-pressed', 'true');
  await expect(todosEdad).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(TARJETAS)).toHaveCount(3);

  await filtro7.click();
  await expect(filtro7).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(TARJETAS)).toHaveCount(17);

  await todosEdad.click();
  await expect(todosEdad).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(TARJETAS)).toHaveCount(slugsDelCatalogo().length);
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
