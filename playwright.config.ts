import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4321', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium', channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'npx tsx tests/browser-server.ts',
    url: 'http://127.0.0.1:4321/api/status',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
