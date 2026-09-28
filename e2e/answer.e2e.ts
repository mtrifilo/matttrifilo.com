import {
  FOLLOW_UPS_LABEL,
  PROGRESS_THINKING,
  progressSummary,
} from '@/components/assistant/copy'
import { toSeconds } from '@/lib/chat/progress'
import { RECORDED_FOLLOW_UPS, RECORDED_RUN_MS } from './fixtures/chat-answer'
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
} from './support'

/**
 * A question asked three ways, and the answer the page makes of the stream
 * (MTC-33, MTC-41, MTC-42, MTC-74). The route is never reached: every answer
 * is the recorded one in e2e/fixtures, which carries one read, a short
 * answer, its citation line and two follow-ups.
 */

const SUMMARY = progressSummary(1, 0, toSeconds(RECORDED_RUN_MS))

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

  // The collapsed line names the tool and the one source it read.
  await expect(page.getByText(SUMMARY, { exact: true })).toBeVisible()
  // Both trailers are taken off before anything is drawn.
  await expect(page.getByText('Sources:', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Follow-ups:', { exact: false })).toHaveCount(0)

  const followUps = page.getByRole('group', { name: FOLLOW_UPS_LABEL })
  await expect(followUps.getByRole('button')).toHaveText([
    ...RECORDED_FOLLOW_UPS,
  ])

  // MTC-74: a finger's pick leaves the keyboard down; any other pick puts the
  // caret in the composer for the next question.
  if (hasTouch) {
    await expect(composer(page)).not.toBeFocused()
    await expect(statusRegion(page)).toBeFocused()
  } else {
    await expect(composer(page)).toBeFocused()
  }

  // The client half of BotID ran: its challenge script loaded, answered, and
  // stamped the request. Only the route checks the stamp, and the route is
  // stubbed here.
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
  await expect.poll(() => chat.calls.length).toBe(2)
  expect(chat.calls[1].question).toBe(followUp)
  if (hasTouch) await expect(composer(page)).not.toBeFocused()
  else await expect(composer(page)).toBeFocused()
})

test('a typed question shows the wait, then the answer', async ({
  page,
  chat,
  hasTouch,
}) => {
  await page.goto('/ask')
  const question = 'What does the recorded fixture say?'
  await composer(page).fill(question)
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
  // The hand-off carries how the question was picked (MTC-74).
  if (hasTouch) await expect(composer(page)).not.toBeFocused()
  else await expect(composer(page)).toBeFocused()
})
