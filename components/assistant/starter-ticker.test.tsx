import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { STARTER_QUESTIONS } from './copy'
import { StarterTicker } from './starter-ticker'
import { TICKER_COPIES, tickerRows } from './ticker-geometry'

/**
 * What the two rows put on the page (MTC-55).
 *
 * The motion, the pauses and the focus handling need a browser and are proven
 * on the preview. The markup underneath them does not: that every question
 * reaches a row, that each row repeats itself exactly as often as the
 * keyframe's distance assumes, and that only the first copy is announced are
 * all decided at render time, and each of them is silent when it breaks.
 */

const [FIRST_ROW, SECOND_ROW] = tickerRows(STARTER_QUESTIONS)

const html = renderToStaticMarkup(<StarterTicker onPick={() => {}} />)

/** The pill labels, in the order the markup lays them out. */
function pillTexts(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match =>
    decodeEntities(match[1])
  )
}

function decodeEntities(text: string): string {
  return text
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

describe('the starter ticker', () => {
  test('lays the pool out as two rows, each repeated once', () => {
    // The keyframe travels 100 / TICKER_COPIES percent of a track, which is
    // one copy only while each row renders exactly that many.
    const rows = html.match(/starter-ticker-row/g) ?? []
    const copies = html.match(/starter-ticker-copy/g) ?? []
    expect(rows).toHaveLength(2)
    expect(copies).toHaveLength(2 * TICKER_COPIES)
  })

  test('puts the odd questions in the first row and the even ones in the second', () => {
    const expected = [
      ...Array.from({ length: TICKER_COPIES }, () => FIRST_ROW).flat(),
      ...Array.from({ length: TICKER_COPIES }, () => SECOND_ROW).flat(),
    ]
    expect(pillTexts(html)).toEqual(expected)
  })

  test('offers every question, and offers none of them twice over', () => {
    const texts = pillTexts(html)
    const secondRowStart = FIRST_ROW.length * TICKER_COPIES
    const announced = [
      ...texts.slice(0, FIRST_ROW.length),
      ...texts.slice(secondRowStart, secondRowStart + SECOND_ROW.length),
    ]
    expect(announced).toHaveLength(STARTER_QUESTIONS.length)
    expect(new Set(announced).size).toBe(STARTER_QUESTIONS.length)
  })

  test('announces one copy of each row and silences the rest', () => {
    // A trailing copy that were announced would read to a screen reader as
    // the questions said twice; one that were focusable would double the tab
    // stops before the composer.
    const hidden = html.match(/aria-hidden="true"/g) ?? []
    const untabbable = html.match(/tabindex="-1"/g) ?? []
    expect(hidden).toHaveLength(2 * (TICKER_COPIES - 1))
    expect(untabbable).toHaveLength(
      (TICKER_COPIES - 1) * STARTER_QUESTIONS.length
    )
  })

  test('names the rows once, as one group', () => {
    const groups = html.match(/role="group"/g) ?? []
    expect(groups).toHaveLength(1)
    expect(html).toContain('aria-label="Starter questions"')
  })

  test('wears the class that carries the shared edge fade', () => {
    // Without it a row loses its gradient and parks a focused pill under the
    // edge, and no other check here would notice.
    expect(html).toContain('edge-faded-row')
  })
})
