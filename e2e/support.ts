import { readFileSync } from 'fs'
import path from 'path'
import {
  expect,
  test as base,
  type Locator,
  type Page,
  type Request,
  type Route,
} from '@playwright/test'
import { FOLLOW_UPS_LABEL, progressSummary } from '@/components/assistant/copy'
import { toSeconds } from '@/lib/chat/progress'
import {
  RECORDED_ANSWER_HEADERS,
  RECORDED_ANSWER_PARAGRAPHS,
  RECORDED_ANSWER_FILE,
  RECORDED_FOLLOW_UPS,
  RECORDED_RUN_MS,
} from './fixtures/chat-answer'

/**
 * What every browser check shares (MTC-86): the chat route answered in the
 * browser, the console watched, and the ticker read the way a visitor sees
 * it.
 */

/** One response for the chat route to be answered with. */
export interface ChatReply {
  status: number
  headers: Record<string, string>
  body: string
}

/** The recorded answer: one read, a short answer, two follow-ups. */
export const RECORDED_REPLY: ChatReply = {
  status: 200,
  headers: { ...RECORDED_ANSWER_HEADERS },
  body: readFileSync(
    path.join(__dirname, 'fixtures', RECORDED_ANSWER_FILE),
    'utf8'
  ),
}

/** The collapsed line above the recorded answer. */
export const RECORDED_SUMMARY = progressSummary(
  1,
  0,
  toSeconds(RECORDED_RUN_MS)
)

/** What one POST to /api/chat carried. */
export interface ChatCall {
  /** The last question in the posted conversation. */
  question: string
  /**
   * Whether BotID's client had stamped the request with its classification
   * header, which it does only once its challenge script has loaded and
   * answered. The route is where that header is checked; the stub never
   * checks it, so this is the only place a test can see the client half.
   */
  botIdHeader: boolean
}

export interface ChatStub {
  /** Every request the page sent, in order. */
  readonly calls: ChatCall[]
  /** Answers every later request with this instead. */
  replyWith(reply: ChatReply): void
  /**
   * Holds the next request unanswered until the returned function is called,
   * so a test can look at the page while a question is in flight.
   */
  holdNext(): () => void
}

/**
 * Console errors and uncaught page errors, checked after every test: any
 * one of them fails it.
 */
export interface PageErrors {
  /**
   * Excuses console errors matching `pattern` for this test only. For the
   * line a browser logs about a response it was told to expect, such as the
   * 429 a rate-limit test stubs; never for an uncaught error.
   */
  expectConsoleError(pattern: RegExp): void
}

interface Fixtures {
  chat: ChatStub
  pageErrors: PageErrors
}

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const consoleErrors: string[] = []
      const pageErrors: string[] = []
      const expected: RegExp[] = []
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      page.on('pageerror', error => pageErrors.push(error.message))
      await use({
        expectConsoleError(pattern) {
          expected.push(pattern)
        },
      })
      expect(pageErrors, 'uncaught errors in the page').toEqual([])
      expect(
        consoleErrors.filter(text => !expected.some(p => p.test(text))),
        'console errors'
      ).toEqual([])
    },
    { auto: true },
  ],

  chat: [
    async ({ page }, use) => {
      // Routed on the context, not the page, so a popup or a second page is
      // answered the same way.
      const context = page.context()

      // Vercel serves its analytics script; `next start` does not, and the
      // 404 would be a console error that says nothing about the site. An
      // empty script sends no page views either.
      await context.route('**/_vercel/insights/**', route =>
        route.fulfill({
          status: 200,
          contentType: 'text/javascript',
          body: '',
        })
      )

      await context.route(isBotIdChallenge, answerBotIdChallenge)

      const calls: ChatCall[] = []
      let reply = RECORDED_REPLY
      let held: Promise<void> | null = null
      await context.route('**/api/chat', async (route: Route) => {
        const request = route.request()
        if (request.method() !== 'POST') return route.abort()
        calls.push({
          question: lastQuestion(request),
          botIdHeader: (await request.headerValue('x-is-human')) !== null,
        })
        const gate = held
        held = null
        if (gate) await gate
        await route.fulfill(reply)
      })

      await use({
        calls,
        replyWith(next) {
          reply = next
        },
        holdNext() {
          let release = () => {}
          held = new Promise(resolve => {
            release = resolve
          })
          return release
        },
      })
    },
    // Every test gets it, so no page can ever reach the real route: a test
    // that forgot to stub would otherwise spend a model call, or fail on a
    // server with no credentials.
    { auto: true },
  ],
})

/**
 * BotID's challenge script, which its patched `fetch` loads and waits on
 * before it sends a protected request (node_modules/botid, client core).
 * `next start` proxies it to Vercel's endpoint (`withBotId` in
 * next.config.ts), so without a stub every question in the suite would wait
 * on a third-party service answering a CI runner. ./botid.e2e.ts removes
 * the stub and loads the real script.
 */
export const isBotIdChallenge = (url: URL): boolean =>
  url.pathname.endsWith('/a-4-a/c.js')

/**
 * Stands in for the challenge: hands BotID's client a token through the
 * queue it listens on, as the real script does once it has run. The route
 * would refuse this token, but the route is never reached.
 */
export function answerBotIdChallenge(route: Route): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.V_C = window.V_C || []; window.V_C.push({ b: 1 })',
  })
}

export { expect }

function lastQuestion(request: Request): string {
  const body = request.postDataJSON() as {
    messages?: { role: string; parts?: { type: string; text?: string }[] }[]
  }
  const question = body.messages?.filter(message => message.role === 'user')
  const parts = question?.at(-1)?.parts ?? []
  return parts
    .filter(part => part.type === 'text')
    .map(part => part.text ?? '')
    .join('')
}

/* ------------------------------------------------------------------ *
 * The page.                                                           *
 * ------------------------------------------------------------------ */

/** The composer's text box, on either surface. */
export const composer = (page: Page): Locator =>
  page.getByRole('textbox', { name: "Ask a question about Matt's work" })

/** The group that holds the rows, or the list once it is open. */
export const starterGroup = (page: Page): Locator =>
  page.getByRole('group', { name: 'Starter questions' })

/** The two ticker rows' scroll boxes. */
export const tickerRows = (page: Page): Locator =>
  page.locator('.starter-ticker-row')

/**
 * The transcript's visually hidden status line, which a touch pick sends
 * focus to so the phone's keyboard stays down (MTC-74).
 */
export const statusRegion = (page: Page): Locator =>
  page.locator('p[role="status"][tabindex="-1"]')

/** A question the visitor asked, as the transcript shows it. */
export const askedQuestion = (page: Page, question: string): Locator =>
  page.locator('.is-user').filter({ hasText: question })

/** The newest assistant turn in the transcript. */
export const lastAnswer = (page: Page): Locator =>
  page.locator('.is-assistant').last()

/**
 * Waits for the recorded answer to be on screen, whole, and checks what the
 * page made of the stream: the prose, the collapsed line naming the tool and
 * its one source, both trailers taken off the text, and the follow-up pills.
 */
export async function expectRecordedAnswer(page: Page): Promise<void> {
  const answer = lastAnswer(page)
  for (const paragraph of RECORDED_ANSWER_PARAGRAPHS) {
    await expect(answer.getByText(paragraph, { exact: true })).toBeVisible()
  }
  // Collapsed: the steps fold away behind the summary once the answer is in.
  await expect(
    answer.getByRole('button', { name: RECORDED_SUMMARY })
  ).toHaveAttribute('aria-expanded', 'false')
  await expect(answer).not.toContainText('Sources:')
  await expect(answer).not.toContainText('Follow-ups:')
  await expect(
    page
      .getByRole('group', { name: FOLLOW_UPS_LABEL })
      .last()
      .getByRole('button')
  ).toHaveText([...RECORDED_FOLLOW_UPS])
}

/**
 * Waits until both rows have been placed on their opening pill. Before
 * that a moving row is invisible (app/globals.css), so nothing a test reads
 * off it would mean anything.
 */
export async function waitForRows(page: Page): Promise<void> {
  await expect(
    page.locator('.starter-ticker-track[data-placed="true"]')
  ).toHaveCount(2)
}

/**
 * Types a question into the composer once the page can hear it, and checks
 * that Send came alive. `fill` sets the whole value in one input event, and
 * one that lands before React has hydrated the chat reaches no handler: the
 * box shows the text while Send stays disabled. A person's next keystroke
 * would bring the state back in line; `fill` has no next keystroke. The rows
 * are placed by an effect in the same tree as the composer, with no
 * Suspense boundary between them on either surface, so placed rows mean the
 * composer is hydrated too.
 */
export async function typeQuestion(
  page: Page,
  question: string
): Promise<void> {
  await waitForRows(page)
  await composer(page).fill(question)
  await expect(
    page.getByRole('button', { name: 'Send question' })
  ).toBeEnabled()
}

/**
 * Waits for the page's fonts and two more frames. A row measures itself
 * again when a font changes its pills' widths, so a measurement taken before
 * the fonts are in may be of a layout the visitor never keeps.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
  })
}

/** Where a pill sits on the page, and what it asks. */
export interface PillSpot {
  question: string
  x: number
  y: number
}

/**
 * The pill showing most of itself in a row's clear window (between the two
 * fades), wherever the row has got to, and the middle of what shows: where
 * a visitor would put a finger or the pointer. At 390 a question is often
 * wider than the window, so "most of itself" rather than "all of it". The
 * rows move, so the spot is only good for a moment; a caller either stops
 * the rows first or acts on it right away.
 */
export async function pillInView(page: Page, row: number): Promise<PillSpot> {
  const spot = await page.evaluate(rowIndex => {
    const viewport = document.querySelectorAll('.starter-ticker-row')[rowIndex]
    if (!(viewport instanceof HTMLElement)) return null
    const fade = parseFloat(
      getComputedStyle(viewport).getPropertyValue('--edge-fade')
    )
    const box = viewport.getBoundingClientRect()
    const clearLeft = box.left + fade
    const clearRight = box.right - fade
    let best: { question: string; x: number; y: number; shown: number } | null =
      null
    for (const pill of viewport.querySelectorAll('button')) {
      const rect = pill.getBoundingClientRect()
      const left = Math.max(rect.left, clearLeft)
      const right = Math.min(rect.right, clearRight)
      const shown = right - left
      if (rect.height === 0 || shown <= 0) continue
      if (best && best.shown >= shown) continue
      best = {
        question: pill.textContent ?? '',
        x: (left + right) / 2,
        y: rect.top + rect.height / 2,
        shown,
      }
    }
    return best
  }, row)
  // Anything narrower is a sliver a visitor could not aim at.
  if (!spot || spot.shown < 40) {
    throw new Error(`row ${row} shows no pill clear of its fades`)
  }
  return { question: spot.question, x: spot.x, y: spot.y }
}

/**
 * Picks a question from the rows the way the project's visitor would: a
 * finger taps it, or a mouse comes to rest on the rows (which holds both
 * still) and clicks it. A moving pill never passes Playwright's stability
 * check, which is why this aims by coordinates rather than by locator.
 */
export async function pickFromRows(
  page: Page,
  hasTouch: boolean,
  row = 0
): Promise<string> {
  await waitForRows(page)
  await tickerRows(page).nth(row).scrollIntoViewIfNeeded()
  if (hasTouch) {
    const spot = await pillInView(page, row)
    // The touch itself stops the row where it is, so the pill measured a
    // moment ago is still under the finger.
    await page.touchscreen.tap(spot.x, spot.y)
    return spot.question
  }
  // Rest the mouse on the row first, over its padding rather than a pill.
  const box = await tickerRows(page).nth(row).boundingBox()
  if (!box) throw new Error(`row ${row} is not laid out`)
  await page.mouse.move(box.x + box.width / 2, box.y + 1)
  const spot = await pillInView(page, row)
  await page.mouse.click(spot.x, spot.y)
  return spot.question
}

/** Taps on a touch project and clicks otherwise. */
export async function press(
  locator: Locator,
  hasTouch: boolean
): Promise<void> {
  if (hasTouch) await locator.tap()
  else await locator.click()
}

/**
 * Holds every ticker loop at its first frame, by serving the page with its
 * play state paused from the first byte.
 *
 * The rows move from the moment they are placed, so by the time a test can
 * look they have moved on from the frame they opened on. Paused, a row still
 * runs every step of its placement (it measures itself, restarts its
 * animation at the opening offset, and measures again as fonts arrive), and
 * then stays on the frame a visitor's first paint shows.
 */
export async function holdLoopsAtOpening(page: Page): Promise<void> {
  await page.route(
    url => url.pathname === '/' || url.pathname === '/ask',
    async route => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const response = await route.fetch()
      const html = await response.text()
      // The text is decoded and about to change length, so the server's
      // encoding and length no longer describe it.
      const headers = { ...response.headers() }
      delete headers['content-encoding']
      delete headers['content-length']
      await route.fulfill({
        response,
        headers,
        body: html.replace(
          '</head>',
          '<style>.starter-ticker-track{animation-play-state:paused!important}</style></head>'
        ),
      })
    }
  )
}

/** What a row shows at its left fade, measured in the page. */
export interface RowOpening {
  /** The pill nearest the edge of the left fade. */
  question: string
  /** How far that pill's leading edge sits from the fade's edge, in px. */
  offset: number
  /** Pills the fade's edge cuts through, which a whole opening has none of. */
  cut: string[]
  /** Distinct pill heights in the row, rounded: one when no pill wraps. */
  heights: number[]
}

export async function rowOpenings(page: Page): Promise<RowOpening[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.starter-ticker-row')].map(viewport => {
      const fade = parseFloat(
        getComputedStyle(viewport).getPropertyValue('--edge-fade')
      )
      const edge = viewport.getBoundingClientRect().left + fade
      const pills = [...viewport.querySelectorAll('button')]
        .map(pill => ({
          question: pill.textContent ?? '',
          rect: pill.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.width > 0)
      const nearest = pills.reduce((best, pill) =>
        Math.abs(pill.rect.left - edge) < Math.abs(best.rect.left - edge)
          ? pill
          : best
      )
      return {
        question: nearest.question,
        offset: nearest.rect.left - edge,
        cut: pills
          .filter(({ rect }) => rect.left < edge - 1 && rect.right > edge + 1)
          .map(({ question }) => question),
        heights: [...new Set(pills.map(({ rect }) => Math.round(rect.height)))],
      }
    })
  )
}

/** Whether the page scrolls sideways, which no page at 390 should. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
}
