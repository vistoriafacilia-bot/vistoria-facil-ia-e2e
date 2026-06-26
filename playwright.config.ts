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
      VITE_SUPABASE_URL: 'https://e2e-local.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-local-anon-key',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
