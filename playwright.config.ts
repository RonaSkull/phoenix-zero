import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PW_BASE_URL || 'http://localhost:3000';
const browserChannel = (process.env.PW_BROWSER_CHANNEL || '').trim();
const useWebServer = process.env.PW_NO_WEBSERVER !== '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(browserChannel ? { channel: browserChannel } : {}) }
    }
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  ...(useWebServer
    ? {
        webServer: {
          command: 'npm run dev:web',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            PHOENIX_ZERO_VERIFY_URL_ALLOW_LOCALHOST: '1'
          }
        }
      }
    : {})
});
