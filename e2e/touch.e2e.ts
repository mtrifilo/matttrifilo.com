import type { Page } from '@playwright/test'
import { expect, test, tickerRows, waitForRows } from './support'

/**
 * A finger on the rows (MTC-75, MTC-84): a drag on either row stops both
 * where their loops had got to and hands them over as one strip, which
 * scrolls together and never moves on its own again.
 *
 * Chromium is given a real drag, through the same touch input a phone's
 * compositor sends, so the row scrolls natively. Playwright has no touch
 * drag for WebKit, so there the row is touched for real (a tap on its
 * padding, clear of every pill) and then scrolled by script, which is the
 * scroll a drag would have made; the hand-over and the linked scroll are the
 * same code either way. The feel of the drag on a real phone is still a
 * device check.
 */

test.skip(({ hasTouch }) => !hasTouch, 'touch is the mobile projects')

/** Each row as the stylesheet and the component see it. */
interface RowState {
  handedOver: boolean
  frozen: boolean
  looping: boolean
  scrollLeft: number
  firstPillLeft: number
}

function rowStates(page: Page): Promise<RowState[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.starter-ticker-row')].map(viewport => {
      const track = viewport.querySelector('.starter-ticker-track')
      const loop = track
        ?.getAnimations()
        .find(
          animation =>
            (animation as { animationName?: string }).animationName ===
            'starter-ticker'
        )
      const pill = viewport.querySelector('button')
      return {
        handedOver: (viewport as HTMLElement).dataset.handedOver === 'true',
        frozen: (track as HTMLElement | null)?.dataset.frozen === 'true',
        looping: loop?.playState === 'running',
        scrollLeft: viewport.scrollLeft,
        firstPillLeft: pill?.getBoundingClientRect().left ?? NaN,
      }
    })
  )
}

/** Drags the first row sideways by `distance` px, right to left. */
async function dragFirstRow(
  page: Page,
  browserName: string,
  distance: number
): Promise<void> {
  const box = await tickerRows(page).first().boundingBox()
  if (!box) throw new Error('the first row is not laid out')
  const y = box.y + box.height / 2
  const startX = box.x + box.width * 0.75

  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y }],
    })
    const steps = 12
    for (let step = 1; step <= steps; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX - (distance * step) / steps, y }],
      })
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await cdp.detach()
    return
  }

  // The row's own padding, above the pills, so the tap asks nothing.
  await page.touchscreen.tap(startX, box.y + 1)
  await page.evaluate(pixels => {
    const viewport = document.querySelector('.starter-ticker-row')
    if (viewport) viewport.scrollLeft += pixels
  }, distance)
}

test('a drag on one row hands both over, stopped, scrolling as one', async ({
  page,
  browserName,
}) => {
  await page.goto('/ask')
  await waitForRows(page)

  const before = await rowStates(page)
  expect(before.map(row => row.handedOver)).toEqual([false, false])
  expect(before.map(row => row.looping)).toEqual([true, true])

  const distance = 160
  await dragFirstRow(page, browserName, distance)

  await expect(tickerRows(page).nth(0)).toHaveAttribute(
    'data-handed-over',
    'true'
  )
  await expect(tickerRows(page).nth(1)).toHaveAttribute(
    'data-handed-over',
    'true'
  )

  // Let any momentum from the drag run out before reading positions.
  await expect
    .poll(async () => {
      const first = await rowStates(page)
      await page.waitForTimeout(250)
      const second = await rowStates(page)
      return first.every(
        (row, index) => row.scrollLeft === second[index].scrollLeft
      )
    })
    .toBe(true)

  const settled = await rowStates(page)
  for (const row of settled) {
    expect(row.frozen).toBe(true)
    expect(row.looping).toBe(false)
  }
  // One strip: the rows share a scroll position.
  expect(
    Math.abs(settled[0].scrollLeft - settled[1].scrollLeft)
  ).toBeLessThanOrEqual(1)

  // The drag moved the row it landed on, and the other row by the same
  // distance. Until the touch both rows drifted at the one ticker speed, so
  // what separates their pills' movement is the linked scroll alone.
  const moved = settled.map(
    (row, index) => before[index].firstPillLeft - row.firstPillLeft
  )
  expect(moved[0]).toBeGreaterThanOrEqual(distance * 0.6)
  expect(Math.abs(moved[0] - moved[1])).toBeLessThanOrEqual(2)

  // Stopped for good: nothing moves on its own afterwards.
  await page.waitForTimeout(1_000)
  const later = await rowStates(page)
  later.forEach((row, index) => {
    expect(row.scrollLeft).toBe(settled[index].scrollLeft)
    expect(row.firstPillLeft).toBe(settled[index].firstPillLeft)
    expect(row.looping).toBe(false)
  })
})
