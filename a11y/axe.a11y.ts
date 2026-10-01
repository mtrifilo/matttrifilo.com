import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  seeAllQuestionsLabel,
  SHOW_FEWER_LABEL,
  STARTER_QUESTIONS,
} from '@/components/assistant/copy'

/**
 * axe-core against the homepage and /ask, as a production build serves
 * them (MTC-88): a phone at 390 px and a desktop at 1440 px, each in the
 * light and the dark theme, and /ask again with every starter question
 * open. Any WCAG 2.0, 2.1 or 2.2 A or AA violation fails the job.
 *
 * Only what loads without a question: the job never calls the model, so an
 * answer on screen is not scanned here. What an answer adds (the progress
 * rows, the actions, the follow-ups) is held by the component tests in
 * components/assistant and by the hand checks in the runbook's
 * "Accessibility and performance" section.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const DEVICES = [
  {
    name: 'phone',
    use: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: 'desktop',
    use: { viewport: { width: 1440, height: 900 } },
  },
] as const

const THEMES = ['light', 'dark'] as const

const PAGES = [
  { path: '/', name: 'the homepage' },
  { path: '/ask', name: '/ask' },
] as const

/**
 * The page as a visitor first meets it: hydrated, with the starter rows
 * placed on their opening pill (until then the stylesheet hides them, and a
 * hidden row is not scanned).
 */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page
    .locator(".starter-ticker-track[data-placed='true']")
    .first()
    .waitFor()
}

/**
 * True once every animation and transition that has an end has reached it.
 * The starter rows loop forever, and an animation driven by the scroll
 * rather than the clock ends only when the visitor scrolls, so neither
 * ever ends; both count as settled as they stand. An animation held paused
 * counts too, since that frame is what the visitor sees.
 *
 * Runs in the page, so it closes over nothing.
 */
function isAtRest(): boolean {
  return document.getAnimations().every(animation => {
    const end = animation.effect?.getComputedTiming().endTime
    const ends =
      animation.timeline === document.timeline &&
      typeof end === 'number' &&
      Number.isFinite(end)
    return !ends || (animation.playState !== 'running' && !animation.pending)
  })
}

/**
 * axe reads colors as they are drawn at the moment it runs. The post list
 * fades in (`.animate-fade-in-up`, 300 ms from transparent), so a scan
 * inside that window measures the muted date line part way to full opacity,
 * under 4.5:1 on the light theme although it is 4.76:1 at rest. Every scan
 * therefore waits for the page to come to rest first: what is measured is
 * the page a visitor reads, with the default motion setting, once its
 * entrance is over. Emulating reduced motion would also stop the fade, but
 * it turns the starter rows into scrolled strips with other padding and
 * drops their looped copy, so it would scan a page most visitors never see.
 */
async function waitForRest(page: Page): Promise<void> {
  await page.waitForFunction(isAtRest, undefined, { polling: 'raf' })
}

async function expectNoViolations(page: Page, label: string): Promise<void> {
  await waitForRest(page)
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  await test.info().attach(`axe ${label}`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  })
  const summary = results.violations.map(violation => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map(node => node.target.join(' ')),
  }))
  expect(summary, `axe violations on ${label}`).toEqual([])
}

for (const device of DEVICES) {
  for (const theme of THEMES) {
    test.describe(`${device.name}, ${theme} theme`, () => {
      test.use({ ...device.use, colorScheme: theme })

      for (const { path, name } of PAGES) {
        test(`${name} has no WCAG A or AA violations`, async ({ page }) => {
          await open(page, path)
          await expectNoViolations(page, `${path} ${device.name} ${theme}`)
        })
      }

      test('/ask with every question open has no WCAG A or AA violations', async ({
        page,
      }) => {
        await open(page, '/ask')
        await page
          .getByRole('button', {
            name: seeAllQuestionsLabel(STARTER_QUESTIONS.length),
          })
          .click()
        await expect(
          page.getByRole('button', { name: SHOW_FEWER_LABEL })
        ).toBeVisible()
        await expectNoViolations(page, `/ask list ${device.name} ${theme}`)
      })
    })
  }
}
