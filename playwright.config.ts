import { defineConfig, devices } from '@playwright/test';

const nodeCommand = JSON.stringify(process.execPath);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    acceptDownloads: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `${nodeCommand} scripts/e2e-webserver.mjs`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_E2E_MODE: 'true',
      E2E_MODE: 'true',
      DISABLE_HMR: 'true',
      VITE_GEMINI_API_KEY: 'E2E-ONLY',
      MERCADOPAGO_ACCESS_TOKEN: 'TEST-E2E-ONLY',
      FIREBASE_PROJECT_ID: 'e2e-local',
      FIRESTORE_DATABASE_ID: '(default)',
      FIREBASE_API_KEY: 'e2e-local',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
