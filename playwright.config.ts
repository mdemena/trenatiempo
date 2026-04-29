import { defineConfig, devices } from '@playwright/test'

// Non-empty remote URL → test against deployed app, no local server needed.
const remoteBase = process.env.PLAYWRIGHT_BASE_URL || ''

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL: remoteBase || 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'es-ES',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // Start a local server only when not pointing at a remote deployment.
  // In CI: use the production build (pnpm start) — the E2E job builds first.
  // Locally: reuse whatever is already running on port 3000 (dev server).
  ...(remoteBase
    ? {}
    : {
        webServer: {
          command: process.env.CI ? 'pnpm start' : 'pnpm dev',
          port: 3000,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
