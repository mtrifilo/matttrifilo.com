import type { Page } from '@playwright/test'
import {
  FOLLOW_UPS_LABEL,
  PROGRESS_THINKING,
} from '@/components/assistant/copy'
import { RECORDED_FOLLOW_UPS } from './fixtures/chat-answer'
import {
  askedQuestion,
  composer,
  expect,
  expectRecordedAnswer,
  horizontalOverflow,
  pickFromRows,
  press,
  statusRegion,
  test,
  typeQuestion,
} from './support'

/**
 * A question asked each way a visitor can ask one, and the answer the page
 * makes of the stream (MTC-33, MTC-41, MTC-42, MTC-74). The route is never
 * reached: every answer is the recorded one in e2e/fixtures, which carries
 * one read, a short answer, its citation line and two follow-ups, and
 * `expectRecordedAnswer` checks all of what the page draws from it.
 */

/**
 * Where focus lands after a pick (MTC-74): a finger's pick leaves the
 * keyboard down by focusing the status line; any other pick puts the caret
 * in the composer for the next question.
 */
async function expectFocusAfterPick(
  page: Page,
  hasTouch: boolean
): Promise<void> {
  if (hasTouch) {
    await expect(statusRegion(page)).toBeFocused()
    await expect(composer(page)).not.toBeFocused()
  } else {
    await expect(composer(page)).toBeFocused()
  }
}

test('a question picked from the rows on /ask is answered in full', async ({
  page,
  chat,
  hasTouch,
}) => {
  await page.goto('/ask')
  const question = await pickFromRows(page, hasTouch)

  await expect(askedQuestion(page, question)).toBeVisible()
  await expectRecordedAnswer(page)
  expect(chat.calls.map(call => call.question)).toEqual([question])
  await expectFocusAfterPick(page, hasTouch)

  // BotID's patched fetch waited for its challenge and stamped the request
  // before it left the page. The stamp is only checked by the route, which
  // is stubbed; ./botid.e2e.ts loads the real challenge.
  expect(chat.calls.every(call => call.botIdHeader)).toBe(true)

  if (hasTouch) expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
})

test('a follow-up is asked as the next question', async ({
  page,
  chat,
  hasTouch,
}) => {
  await page.goto('/ask')
  await pickFromRows(page, hasTouch)
  await expectRecordedAnswer(page)

  const [followUp] = RECORDED_FOLLOW_UPS
  await press(
    page
      .getByRole('group', { name: FOLLOW_UPS_LABEL })
      .getByRole('button', { name: followUp }),
    hasTouch
  )

  await expect(askedQuestion(page, followUp)).toBeVisible()
  await expectRecordedAnswer(page)
  expect(chat.calls.map(call => call.question)).toHaveLength(2)
  expect(chat.calls[1].question).toBe(followUp)
  await expectFocusAfterPick(page, hasTouch)
})

test('a typed question on /ask shows the wait, then the answer', async ({
  page,
  chat,
  hasTouch,
}) => {
  await page.goto('/ask')
  const question = 'What does the recorded fixture say?'
  await typeQuestion(page, question)
  const release = chat.holdNext()
  await press(page.getByRole('button', { name: 'Send question' }), hasTouch)

  // In flight: the question is in the transcript, the wait is narrated and
  // the send button has become Stop.
  await expect(askedQuestion(page, question)).toBeVisible()
  await expect(page.getByText(PROGRESS_THINKING)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Stop generating' })
  ).toBeVisible()
  await expect(composer(page)).toHaveValue('')

  release()
  await expectRecordedAnswer(page)
  await expect(
    page.getByRole('button', { name: 'Send question' })
  ).toBeVisible()
  expect(chat.calls.map(call => call.question)).toEqual([question])
})

test('a question picked on the homepage is answered on /ask', async ({
  page,
  chat,
  hasTouch,
}) => {
  await page.goto('/')
  const question = await pickFromRows(page, hasTouch)

  await expect(page).toHaveURL(/\/ask$/)
  await expect(askedQuestion(page, question)).toBeVisible()
  await expectRecordedAnswer(page)
  expect(chat.calls.map(call => call.question)).toEqual([question])
  // The hand-off carries how the question was picked.
  await expectFocusAfterPick(page, hasTouch)
  if (hasTouch) expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
})

test('a question typed on the homepage is answered on /ask', async ({
  page,
  chat,
  hasTouch,
}) => {
  await page.goto('/')
  const question = 'What does the recorded fixture say?'
  await composer(page).scrollIntoViewIfNeeded()
  await typeQuestion(page, question)
  await press(page.getByRole('button', { name: 'Send question' }), hasTouch)

  await expect(page).toHaveURL(/\/ask$/)
  await expect(askedQuestion(page, question)).toBeVisible()
  await expectRecordedAnswer(page)
  expect(chat.calls.map(call => call.question)).toEqual([question])
})
