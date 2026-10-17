import { expect, test } from '@playwright/test';

test('la portada responde', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
