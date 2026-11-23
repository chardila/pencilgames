import { expect, type Page } from '@playwright/test';

// Botones de los modales de arranque, en el orden en que pueden aparecer.
// Cualquiera puede faltar según el juego (no todos tienen modo remoto, etc.).
const PASOS = [
  '#modal-continuar-no',
  '#modal-instrucciones-cerrar',
  '#modal-modo-juego-local',
  '#modal-jugadores-guardar',
];

const MODALES = [
  '#modal-continuar-partida',
  '#modal-instrucciones',
  '#modal-modo-juego',
  '#modal-jugadores',
];

/** Atraviesa los modales de arranque eligiendo partida nueva, modo local y nombres por defecto. */
export async function arrancarPartidaLocal(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        for (const selector of PASOS) {
          const boton = page.locator(selector);
          if (await boton.isVisible()) await boton.click();
        }
        if (!(await page.locator('#tablero-juego').isVisible())) return false;
        for (const modal of MODALES) {
          if (await page.locator(modal).isVisible()) return false;
        }
        return true;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}
