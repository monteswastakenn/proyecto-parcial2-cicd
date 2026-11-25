import { defineConfig, devices } from '@playwright/test';

// BASE_URL apunta al stack levantado con docker compose (en CI y en local: http://localhost)
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reporte-playwright', open: 'never' }],
    ['json', { outputFile: 'reporte-playwright/resultados.json' }],
    ['junit', { outputFile: 'reporte-playwright/junit.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'api', testMatch: /api\/.*\.spec\.ts/ },
    { name: 'web', testMatch: /web\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
