import { defineConfig, devices } from '@playwright/test';
import { suiteActiva } from './e2e/seleccion';

const servidores: NonNullable<Parameters<typeof defineConfig>[0]['webServer']> = [
  {
    command: 'npm run preview -- --port 4321 --ignore-lock',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
];

if (suiteActiva('remoto')) {
  servidores.push({
    command: 'npm --prefix worker run dev -- --port 8787',
    port: 8787,
    reuseExistingServer: !process.env.CI,
  });
}

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  // Prueba el `dist` ya construido (npm run build), nunca `astro dev`.
  webServer: servidores,
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
});
