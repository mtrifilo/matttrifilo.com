import { defineConfig, devices } from '@playwright/test'

/**
 * The browser checks (MTC-86): the Career Assistant in real engines, at a
 * phone's width and a desktop's, against a production build of the site.
 *
 * Nothing here starts the site. CI builds it and runs `bun run start` before
 * calling Playwright (.github/workflows/browser-checks.yml), and the runbook
 * says how to point the suite at a site running elsewhere; see "Browser
 * checks" in docs/career-assistant-operations.md. The chat route is never
 * reached: every test answers /api/chat in the browser (e2e/support.ts).
 *
 * The specs are `*.e2e.ts` rather than Playwright's usual `*.spec.ts`
 * because `bun test` collects `*.spec.ts` too, and a Playwright spec loaded
 * by Bun's runner throws. `e2e/fixtures/*.test.ts` is the other way around:
 * a Bun test that lives here because it guards the recording these checks
 * use, and `testMatch` keeps Playwright away from it.
 */

/**
 * The phone both mobile projects emulate: touch, a coarse pointer, no hover,
 * the mobile viewport meta applied, at a 390 x 844 viewport. Each engine
 * keeps its own phone's user agent and pixel
 * ratio, so neither claims to be a browser it is not.
 */
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  forbidOnly: Boolean(process.env.CI),
  // No retries: a check that passes on its second try is a flaky check, and
  // a retry would hide it.
  retries: 0,
  // One `next start` process serves every worker; two keep it from being
  // what a slow test is waiting on.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: PHONE, browserName: 'chromium' },
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 14'], viewport: PHONE, browserName: 'webkit' },
    },
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: DESKTOP,
        browserName: 'chromium',
      },
    },
    {
      name: 'desktop-webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: DESKTOP,
        browserName: 'webkit',
      },
    },
  ],
})
