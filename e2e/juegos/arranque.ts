import type { Page } from '@playwright/test';

// Botones de los modales de arranque, en el orden en que pueden aparecer.
// Cualquiera puede faltar según el juego (no todos tienen modo remoto, etc.).
const PASOS = ['#modal-instrucciones-cerrar', '#modal-continuar-no', '#modal-modo-juego-local', '#modal-jugadores-guardar'];

/** Atraviesa los modales de arranque eligiendo partida nueva, modo local y nombres por defecto. */
export async function arrancarPartidaLocal(page: Page): Promise<void> {
  for (let ronda = 0; ronda < 3; ronda++) {
    for (const selector of PASOS) {
      const boton = page.locator(selector);
      if (await boton.isVisible()) await boton.click();
    }
    await page.waitForTimeout(300);
  }
  await page.locator('#tablero-juego').waitFor({ state: 'visible' });
}
