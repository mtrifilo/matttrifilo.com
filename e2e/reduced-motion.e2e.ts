import type { Page } from '@playwright/test'
import {
  FOLLOW_UPS_LABEL,
  PROGRESS_THINKING,
} from '@/components/assistant/copy'
import {
  expect,
  expectRecordedAnswer,
  pickFromRows,
  rowOpenings,
  test,
  tickerRows,
  waitForRows,
} from './support'

/**
 * A visitor who asked for less motion (WCAG 2.2.2; the research behind
 * MTC-55): the rows are static strips that still open on a whole pill,
 * nothing on the page animates, and an answer arrives without movement.
 */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

/** The names of the CSS animations and transitions running right now. */
function running(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter(animation => animation.playState === 'running')
      .map(animation => {
        const named = animation as {
          animationName?: string
          transitionProperty?: string
        }
        return named.animationName ?? named.transitionProperty ?? 'unnamed'
      })
  )
}

/** Where each row's first pill is, to see whether anything moved. */
function firstPillPositions(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.starter-ticker-row')].map(
      row => row.querySelector('button')?.getBoundingClientRect().left ?? NaN
    )
  )
}

for (const path of ['/', '/ask'] as const) {
  test(`on ${path} the rows are still strips and nothing moves`, async ({
    page,
  }) => {
    await page.goto(path)
    await tickerRows(page).first().scrollIntoViewIfNeeded()
    await waitForRows(page)

    expect(await running(page)).toEqual([])
    // Nothing loops, so the rows are said once: no trailing copy.
    await expect(
      page.locator('.starter-ticker-copy[aria-hidden="true"]').first()
    ).toBeHidden()
    for (const row of await tickerRows(page).all()) {
      await expect(row).toHaveCSS('overflow-x', 'auto')
    }
    // Still whole at rest: the strip's lead keeps its first pill clear of
    // the fade.
    for (const opening of await rowOpenings(page)) {
      expect(Math.abs(opening.offset)).toBeLessThanOrEqual(1)
      expect(opening.cut).toEqual([])
    }

    const before = await firstPillPositions(page)
    await page.waitForTimeout(1_000)
    expect(await firstPillPositions(page)).toEqual(before)
  })
}

test('an answer arrives without motion', async ({ page, chat, hasTouch }) => {
  await page.goto('/ask')
  const release = chat.holdNext()
  await pickFromRows(page, hasTouch)

  // The wait: the spinner is still.
  await expect(page.getByText(PROGRESS_THINKING)).toBeVisible()
  expect(await running(page)).toEqual([])

  release()
  await expectRecordedAnswer(page)
  const followUps = page.getByRole('group', { name: FOLLOW_UPS_LABEL })
  await expect(followUps).toBeVisible()
  // The follow-up row is offered without growing into place.
  await expect(page.locator('.follow-up-reveal')).toHaveCSS(
    'transition-duration',
    '0s'
  )
  expect(await running(page)).toEqual([])
})
