import {
  ASSISTANT_EVALS_TITLE,
  ASSISTANT_HOW_BUILT_TEXT,
  ASSISTANT_HOW_BUILT_URL,
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
  settle,
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
      await settle(page)
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
      if (surface.path === '/ask') {
        // One centered group: the composer is on the first screen, before
        // anything has been scrolled.
        await expect(box).toBeInViewport({ ratio: 1 })
      }
      await box.scrollIntoViewIfNeeded()
      await expect(box).toBeVisible()
      await expect(box).toBeEditable()

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

      const howBuiltLink = page.getByRole('link', {
        name: ASSISTANT_HOW_BUILT_TEXT,
      })
      await expect(howBuiltLink).toBeVisible()
      await expect(howBuiltLink).toHaveAttribute(
        'href',
        ASSISTANT_HOW_BUILT_URL
      )
      await expect(howBuiltLink).toHaveAttribute('target', '_blank')
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
    if (hasTouch) {
      // Past the frame in which the page would have focused it.
      await settle(page)
      await expect(composer(page)).not.toBeFocused()
      expect(
        await page.evaluate(() => document.activeElement === document.body)
      ).toBe(true)
    } else {
      await expect(composer(page)).toBeFocused()
    }
  })
})

test('each project emulates the pointer it names', async ({
  page,
  hasTouch,
}) => {
  // The site decides focus, scrolling and hover pauses from these media
  // features and from a press's pointer type, so a project whose engine did
  // not emulate them would test a different device than it claims.
  await page.goto('/contact')
  const media = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    hover: matchMedia('(hover: hover)').matches,
  }))
  expect(media).toEqual({ coarse: hasTouch, hover: !hasTouch })

  await page.evaluate(() => {
    const target = document.createElement('button')
    target.id = 'pointer-probe'
    target.textContent = 'Probe'
    target.style.cssText = 'position:fixed;top:120px;left:40px;z-index:99'
    target.addEventListener('pointerdown', event => {
      target.dataset.pointerType = event.pointerType
    })
    document.body.append(target)
  })
  const probe = page.locator('#pointer-probe')
  if (hasTouch) await probe.tap()
  else await probe.click()
  await expect(probe).toHaveAttribute(
    'data-pointer-type',
    hasTouch ? 'touch' : 'mouse'
  )
})
