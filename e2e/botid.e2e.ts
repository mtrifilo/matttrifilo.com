import {
  answerBotIdChallenge,
  composer,
  expect,
  expectRecordedAnswer,
  isBotIdChallenge,
  press,
  test,
} from './support'

/**
 * BotID's client half with its real challenge (MTC-34): the one test that
 * leaves the challenge script unstubbed, so it depends on Vercel's endpoint
 * answering, through the same-origin rewrite `next start` proxies to it,
 * for a site on a CI runner. The rest of the suite stubs the script, so an
 * outage there fails this test alone, by name.
 *
 * What it shows: the script loads under the site's CSP without a console
 * error, runs, and stamps the question with its header before it leaves the
 * page. What it cannot show is the verdict: that is `checkBotId` in the
 * route, which the suite never reaches.
 */

test('the real challenge script loads, runs and stamps the question', async ({
  page,
  chat,
  hasTouch,
}) => {
  await page.context().unroute(isBotIdChallenge, answerBotIdChallenge)
  await page.goto('/ask')

  const challenge = page.waitForResponse(response =>
    isBotIdChallenge(new URL(response.url()))
  )
  await composer(page).fill('What does the recorded fixture say?')
  await press(page.getByRole('button', { name: 'Send question' }), hasTouch)

  expect((await challenge).status()).toBe(200)
  await expectRecordedAnswer(page)
  expect(chat.calls).toHaveLength(1)
  expect(chat.calls[0].botIdHeader).toBe(true)
})
