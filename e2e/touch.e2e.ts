import type { Page } from '@playwright/test'
import { expect, test, tickerRows, waitForRows } from './support'

/**
 * A finger on the rows (MTC-75, MTC-79, MTC-84): a drag along either row
 * stops both where their loops had reached and hands them over as one strip,
 * which scrolls together and never moves on its own again. What makes a
 * touch a drag is its first movement: past 8 px, and more across than up or
 * down. A finger that stays within that, or goes up or down, leaves the rows
 * moving.
 *
 * Chromium is given a real drag, through the same touch input a phone's
 * compositor sends, so the row scrolls natively. Playwright has no touch
 * drag for WebKit, so there the touch events are dispatched on the row (the
 * same events, with the finger's coordinates) and the row is then scrolled
 * by script, the scroll the drag would have made, with the scroll event it
 * would have sent; the direction rule, the hand-over and the linked scroll
 * are the same code either way.
 * The feel of the drag on a real phone is still a device check.
 */

test.skip(({ hasTouch }) => !hasTouch, 'touch is the mobile projects')

/**
 * Every touch and scroll event on the rows, in order, with each row's state
 * as the event arrived, kept on the page. A failed test attaches it and
 * prints it, because which event came first (a scroll before or after the
 * finger lifted, a scroll that never came) is what a failure here turns on,
 * and neither a trace nor a screenshot shows it.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log: unknown[] = []
    ;(window as unknown as { rowEvents: unknown[] }).rowEvents = log
    const note = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const viewport = target.closest('.starter-ticker-row')
      if (!viewport) return
      const rows = [...document.querySelectorAll('.starter-ticker-row')]
      const state = (viewport as HTMLElement).dataset
      log.push({
        at: Math.round(event.timeStamp),
        type: event.type,
        row: rows.indexOf(viewport),
        scrollLeft: viewport.scrollLeft,
        handedOver: state.handedOver === 'true',
        touchHeld: state.touchHeld === 'true',
      })
    }
    for (const type of ['touchstart', 'touchmove', 'touchend', 'scroll']) {
      document.addEventListener(type, note, { capture: true, passive: true })
    }
  })
})

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return
  const events = await page
    .evaluate(() => (window as unknown as { rowEvents?: unknown[] }).rowEvents)
    .catch(() => undefined)
  const body = JSON.stringify(events ?? 'not recorded', null, 1)
  console.log(`row events for "${testInfo.title}":\n${body}`)
  await testInfo.attach('row-events', {
    body,
    contentType: 'application/json',
  })
})

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

  await dispatchTouch(page, [
    [0, 0],
    [-distance / 4, 0],
    [-distance, 0],
  ])
  // Playwright's WebKit sends these rows no scroll event for a scroll made
  // by script, where a phone sends one for a finger's, and the linked scroll
  // runs from that event; so the event the drag would have sent goes with it.
  await page.evaluate(pixels => {
    const viewport = document.querySelector('.starter-ticker-row')
    if (!viewport) return
    viewport.scrollLeft += pixels
    viewport.dispatchEvent(new Event('scroll'))
  }, distance)
}

/**
 * Dispatches one finger's touch on the first row: a touchstart at the row's
 * middle, a touchmove to each later offset (in px from where it landed), and
 * a touchend. Dispatched events never scroll anything or produce a click, so
 * this reads only the component's direction rule.
 */
async function dispatchTouch(
  page: Page,
  offsets: readonly (readonly [number, number])[]
): Promise<void> {
  const row = tickerRows(page).first()
  const box = await row.boundingBox()
  if (!box) throw new Error('the first row is not laid out')
  const x = box.x + box.width * 0.75
  const y = box.y + box.height / 2
  const at = ([dx, dy]: readonly [number, number]) => ({
    identifier: 1,
    clientX: x + dx,
    clientY: y + dy,
  })
  const [first, ...rest] = offsets
  await row.dispatchEvent('touchstart', {
    touches: [at(first)],
    changedTouches: [at(first)],
  })
  for (const offset of rest) {
    await row.dispatchEvent('touchmove', {
      touches: [at(offset)],
      changedTouches: [at(offset)],
    })
  }
  const last = offsets[offsets.length - 1]
  await row.dispatchEvent('touchend', {
    touches: [],
    changedTouches: [at(last)],
  })
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

for (const [name, offsets] of [
  [
    'a touch that stays within the threshold',
    [
      [0, 0],
      [4, 3],
    ],
  ],
  [
    'a touch that moves up the page',
    [
      [0, 0],
      [3, -20],
    ],
  ],
] as const) {
  test(`${name} leaves both rows moving`, async ({ page }) => {
    await page.goto('/ask')
    await waitForRows(page)

    await dispatchTouch(page, offsets)

    // The hold a touch puts on the rows ends with it, and neither row was
    // handed over.
    await expect
      .poll(async () => (await rowStates(page)).map(row => row.looping))
      .toEqual([true, true])
    const states = await rowStates(page)
    expect(states.map(row => row.handedOver)).toEqual([false, false])
    expect(states.map(row => row.frozen)).toEqual([false, false])
  })
}
