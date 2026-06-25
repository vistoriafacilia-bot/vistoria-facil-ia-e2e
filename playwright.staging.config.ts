import { defineConfig, devices } from '@playwright/test';

const nodeCommand = JSON.stringify(process.execPath);
const stagingBaseUrl = process.env.STAGING_BASE_URL || 'http://127.0.0.1:4174';
const useLocalPreview = !process.env.STAGING_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e-real',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-staging', open: 'never' }],
    ['json', { outputFile: 'test-results/staging-e2e-results.json' }],
  ],
  use: {
    baseURL: stagingBaseUrl,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: useLocalPreview
    ? {
        command: `${nodeCommand} scripts/e2e-real-webserver.mjs`,
        url: stagingBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          DISABLE_HMR: 'true',
        },
      }
    : undefined,
  projects: [
    {
      name: 'chromium-real-staging',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
