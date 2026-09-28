import {
  ASSISTANT_EVALS_TITLE,
  STARTER_QUESTIONS,
} from '@/components/assistant/copy'
import {
  ASK_START_AT,
  HOME_START_AT,
  pillIndexFor,
  tickerRows as splitIntoRows,
} from '@/components/assistant/ticker-geometry'
import { hasPublishedEvalRun } from '@/lib/evals/results'
import {
  composer,
  expect,
  holdLoopsAtOpening,
  horizontalOverflow,
  rowOpenings,
  test,
  tickerRows,
  waitForRows,
} from './support'

/**
 * The assistant before the first question, on both surfaces (MTC-55,
 * MTC-83): two rows that open on whole pills, the composer, and the lines
 * under it. The layout, the widths and the fonts are what Happy DOM cannot
 * give the component tests, so this is where they are checked.
 */

const ROWS = splitIntoRows(STARTER_QUESTIONS)

const SURFACES = [
  { name: 'the homepage panel', path: '/', startAt: HOME_START_AT },
  { name: '/ask', path: '/ask', startAt: ASK_START_AT },
] as const

for (const surface of SURFACES) {
  test.describe(surface.name, () => {
    test('opens both rows on a whole pill, one line each', async ({ page }) => {
      await holdLoopsAtOpening(page)
      await page.goto(surface.path)
      await tickerRows(page).first().scrollIntoViewIfNeeded()
      await waitForRows(page)
      await expect(tickerRows(page)).toHaveCount(2)
      for (const row of await tickerRows(page).all()) {
        await expect(row).toBeVisible()
      }

      const openings = await rowOpenings(page)
      expect(openings).toHaveLength(2)
      openings.forEach((opening, index) => {
        const questions = ROWS[index]
        expect(opening.question).toBe(
          questions[pillIndexFor(surface.startAt, questions.length)]
        )
        // A pixel either way is subpixel layout, not a cut pill.
        expect(Math.abs(opening.offset)).toBeLessThanOrEqual(1)
        expect(opening.cut).toEqual([])
        expect(opening.heights).toHaveLength(1)
      })
    })

    test('offers the composer and the disclosure under it', async ({
      page,
    }) => {
      await page.goto(surface.path)
      const box = composer(page)
      await box.scrollIntoViewIfNeeded()
      await expect(box).toBeVisible()
      await expect(box).toBeEditable()
      if (surface.path === '/ask') {
        // One centred group: the composer is on the first screen.
        await expect(box).toBeInViewport({ ratio: 1 })
      }

      await expect(
        page.getByText('AI-generated. May be incomplete or wrong.', {
          exact: false,
        })
      ).toBeVisible()
      await expect(page.getByText('Conversations aren’t saved.')).toBeVisible()

      const evalsLink = page.getByRole('link', { name: ASSISTANT_EVALS_TITLE })
      if (hasPublishedEvalRun()) {
        await expect(evalsLink).toBeVisible()
        await expect(evalsLink).toHaveAttribute('href', '/ask/evals')
      } else {
        await expect(evalsLink).toHaveCount(0)
      }
    })

    test('has no sideways scroll on a phone', async ({ page, isMobile }) => {
      test.skip(!isMobile, 'a width check for the 390 projects')
      await page.goto(surface.path)
      await waitForRows(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    })
  })
}

test.describe('/ask on load', () => {
  test('focuses the composer on a desktop and leaves the keyboard down on a phone', async ({
    page,
    hasTouch,
  }) => {
    await page.goto('/ask')
    await waitForRows(page)
    // MTC-67 and MTC-81: the composer is the page's focal point, except on a
    // touch device, where focusing it would raise the keyboard unasked.
    if (hasTouch) await expect(composer(page)).not.toBeFocused()
    else await expect(composer(page)).toBeFocused()
  })
})
