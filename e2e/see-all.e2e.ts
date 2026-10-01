import {
  SHOW_FEWER_LABEL,
  STARTER_QUESTIONS,
  seeAllQuestionsLabel,
} from '@/components/assistant/copy'
import { starterGroups } from '@/components/assistant/starter-groups'
import {
  askedQuestion,
  composer,
  expect,
  expectRecordedAnswer,
  horizontalOverflow,
  press,
  starterGroup,
  statusRegion,
  test,
  tickerRows,
  waitForRows,
} from './support'

/**
 * "See all N questions" (MTC-85, MTC-93): the rows give way to every
 * question, grouped by featured theme in the featuring order with the rest
 * under "More"; a question picked there is asked like any other; "Show
 * fewer" puts the rows back.
 */

const GROUPS = starterGroups()
const SEE_ALL = seeAllQuestionsLabel(STARTER_QUESTIONS.length)

/**
 * The open list as the page draws it: each theme's heading, with its level,
 * and its questions.
 */
function drawnGroups(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const group = document.querySelector(
      '[role="group"][aria-label="Starter questions"]'
    )
    const list = group?.lastElementChild
    if (!list || list.querySelector('.starter-ticker-row')) return []
    return [...list.children].map(section => ({
      heading: section.querySelector('h2, h3')?.textContent ?? '',
      level: section.querySelector('h2, h3')?.tagName ?? '',
      questions: [...section.querySelectorAll('button')].map(
        button => button.textContent ?? ''
      ),
    }))
  })
}

// Each theme's label is a heading one level below the one naming the
// assistant on that surface (MTC-97): the page's h1 on /ask, the panel's h2
// on the homepage.
const LIST_HEADING = { '/ask': 'H2', '/': 'H3' } as const

for (const path of ['/ask', '/'] as const) {
  test(`on ${path} the list opens grouped and closes back to the rows`, async ({
    page,
    hasTouch,
  }) => {
    await page.goto(path)
    await waitForRows(page)
    const toggle = page.getByRole('button', { name: SEE_ALL })
    await toggle.scrollIntoViewIfNeeded()
    await press(toggle, hasTouch)

    const showFewer = page.getByRole('button', { name: SHOW_FEWER_LABEL })
    await expect(showFewer).toHaveAttribute('aria-expanded', 'true')
    for (const row of await tickerRows(page).all()) {
      await expect(row).toBeHidden()
    }
    expect(await drawnGroups(page)).toEqual(
      GROUPS.map(({ heading, questions }) => ({
        heading,
        level: LIST_HEADING[path],
        questions: [...questions],
      }))
    )
    // Every question once, each readable.
    await expect(starterGroup(page).getByRole('button')).toHaveCount(
      STARTER_QUESTIONS.length
    )
    if (hasTouch) expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    await press(showFewer, hasTouch)
    const seeAll = page.getByRole('button', { name: SEE_ALL })
    await expect(seeAll).toHaveAttribute('aria-expanded', 'false')
    await expect(tickerRows(page)).toHaveCount(2)
    for (const row of await tickerRows(page).all()) {
      await expect(row).toBeVisible()
    }
    expect(await drawnGroups(page)).toEqual([])
    // The rows and the control are back where the visitor can reach them.
    await expect(seeAll).toBeInViewport()
  })
}

for (const path of ['/ask', '/'] as const) {
  test(`a question picked from the list on ${path} is asked`, async ({
    page,
    chat,
    hasTouch,
  }) => {
    await page.goto(path)
    await waitForRows(page)
    const toggle = page.getByRole('button', { name: SEE_ALL })
    await toggle.scrollIntoViewIfNeeded()
    await press(toggle, hasTouch)

    // The first question of the second group, so the pick is not simply
    // the pool's first question, which the rows also open on.
    const question = GROUPS[1].questions[0]
    await press(
      starterGroup(page).getByRole('button', { name: question, exact: true }),
      hasTouch
    )

    await expect(page).toHaveURL(/\/ask$/)
    await expect(askedQuestion(page, question)).toBeVisible()
    await expectRecordedAnswer(page)
    expect(chat.calls.map(call => call.question)).toEqual([question])
    // A pick from the list follows the rows' focus rule (MTC-74).
    if (hasTouch) {
      await expect(statusRegion(page)).toBeFocused()
      await expect(composer(page)).not.toBeFocused()
    } else {
      await expect(composer(page)).toBeFocused()
    }
  })
}
