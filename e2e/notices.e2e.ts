import { MATT_MAILTO, RATE_LIMIT_NOTICE } from '@/components/assistant/copy'
import { CHAT_UNKNOWN_ERROR_MESSAGE } from '@/lib/chat/answer'
import { askedQuestion, composer, expect, press, test } from './support'

/**
 * The two refusals a preview cannot produce on demand (MTC-33, MTC-34): the
 * edge rate limit's 429, which arrives with Vercel's body rather than the
 * route's, and a 502 from in front of the route. Both are answered in the
 * browser, as every chat request in these checks is.
 */

const QUESTION = 'What does the recorded fixture say?'

async function ask(
  page: import('@playwright/test').Page,
  hasTouch: boolean
): Promise<void> {
  await page.goto('/ask')
  await composer(page).fill(QUESTION)
  await press(page.getByRole('button', { name: 'Send question' }), hasTouch)
}

test('a 429 from the edge shows the rate-limit notice', async ({
  page,
  chat,
  hasTouch,
  pageErrors,
}) => {
  // Chromium reports a failed response in the console; this one is the test.
  pageErrors.expectConsoleError(/status of 429/)
  chat.replyWith({
    status: 429,
    headers: { 'content-type': 'text/plain' },
    body: 'Too Many Requests',
  })
  await ask(page, hasTouch)

  const notice = page.getByRole('alert').filter({
    hasText: RATE_LIMIT_NOTICE.lead.trim(),
  })
  await expect(notice).toBeVisible()
  await expect(
    notice.getByRole('link', { name: RATE_LIMIT_NOTICE.resumeLabel })
  ).toHaveAttribute('href', '/resume')
  await expect(
    notice.getByRole('link', { name: RATE_LIMIT_NOTICE.emailLabel })
  ).toHaveAttribute('href', MATT_MAILTO)
  expect(chat.calls.map(call => call.question)).toEqual([QUESTION])
})

test('a 502 shows the error notice and keeps the question', async ({
  page,
  chat,
  hasTouch,
  pageErrors,
}) => {
  pageErrors.expectConsoleError(/status of 502/)
  chat.replyWith({
    status: 502,
    headers: { 'content-type': 'text/html' },
    body: '<html><body>Bad Gateway</body></html>',
  })
  await ask(page, hasTouch)

  await expect(
    page.getByRole('alert').filter({ hasText: CHAT_UNKNOWN_ERROR_MESSAGE })
  ).toBeVisible()
  // Not a refusal of the question itself, so it stays in the transcript for
  // a retry rather than going back into the box.
  await expect(askedQuestion(page, QUESTION)).toBeVisible()
  await expect(composer(page)).toHaveValue('')
  expect(chat.calls.map(call => call.question)).toEqual([QUESTION])
})
