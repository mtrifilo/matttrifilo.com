import { defineConfig, devices } from '@playwright/test'

/**
 * The axe-core scan of the Career Assistant's pages (MTC-88), run by the
 * "Accessibility and performance" workflow against a production build the
 * workflow has already started. It starts no server of its own, so it and
 * the Lighthouse runs after it measure the same process.
 *
 * Kept to this directory and to `*.a11y.ts` files: `bun test` collects
 * `*.test.*` and `*.spec.*` anywhere in the repository, and a Playwright
 * file it picked up would fail there.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.a11y.ts',
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'results',
  use: {
    baseURL: process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:3000',
    ...devices['Desktop Chrome'],
  },
})
