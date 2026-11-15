import { defineConfig, devices } from '@playwright/test';

/** Pruebas de humo de extremo a extremo (sección 22.10). Se ejecutan en local contra `vite preview`. */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel: process.env.PW_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
