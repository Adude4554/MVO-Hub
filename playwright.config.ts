import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright smoke-suite configuration for the MVO Hub frontend.
 *
 * The app is a Tauri desktop shell; this suite runs the Vite web build in a
 * browser with a test harness (`VITE_TEST_HARNESS=1`) that skips the splash
 * and auth gates and lets the tests drive page navigation directly.
 *
 * Tauri IPC is unavailable in the browser, but every hook already catches
 * its own command failures, so pages must still render without crashing.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // One worker: the harness keeps per-page state (hidden pages, active page).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:1421',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1500, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Dedicated test mode: enables VITE_TEST_HARNESS and never touches port
    // 1420 (reserved by `tauri dev`).
    command: 'npm run dev:test',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
