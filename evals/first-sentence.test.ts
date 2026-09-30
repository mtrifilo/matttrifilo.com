import { describe, expect, test } from 'bun:test'
import { PROGRESS_PART_TYPE } from '@/lib/chat/progress'
import {
  createStreamTimeline,
  FIRST_SENTENCE_MIN_CHARS,
  firstSentenceEnd,
  gradeDeterministic,
  nearestRank,
} from './first-sentence'

const LEAD = "Matt's team owns outbound email sending end to end at Thryv."

function frame(chunk: Record<string, unknown>): string {
  return `data: ${JSON.stringify(chunk)}\n\n`
}

/** A clock the test advances by hand. */
function manualClock(start = 1_000) {
  let current = start
  return {
    now: () => current,
    at: (ms: number) => {
      current = start + ms
    },
  }
}

describe('firstSentenceEnd', () => {
  test('ends at the first full stop followed by a space past the floor', () => {
    const text = `${LEAD} It also runs compliance.`
    expect(firstSentenceEnd(text, false)).toEqual({
      end: LEAD.length,
      rule: 'punctuation',
    })
  })

  test('ignores a full stop before the floor', () => {
    const text = `Yes. ${LEAD} More follows.`
    const found = firstSentenceEnd(text, false)
    expect(found?.end).toBe(`Yes. ${LEAD}`.length)
    expect(found!.end).toBeGreaterThanOrEqual(FIRST_SENTENCE_MIN_CHARS)
  })

  test('a decimal point mid-stream is not a sentence end', () => {
    expect(
      firstSentenceEnd('The platform sends up to about 1.', false)
    ).toBeUndefined()
    expect(
      firstSentenceEnd('The platform sends up to about 1.5 billion', false)
    ).toBeUndefined()
  })

  test('terminal punctuation at the very end counts only once finished', () => {
    expect(firstSentenceEnd(LEAD, false)).toBeUndefined()
    expect(firstSentenceEnd(LEAD, true)).toEqual({
      end: LEAD.length,
      rule: 'punctuation',
    })
  })

  test('a list-shaped answer ends its first unit at a line break', () => {
    const text =
      '- Owns outbound email sending, deliverability and compliance\n- Runs on-call'
    expect(firstSentenceEnd(text, false)).toEqual({
      end: text.indexOf('\n'),
      rule: 'line',
    })
  })

  test('a line break ends the first unit only once the line holds the floor', () => {
    const short = 'x'.repeat(FIRST_SENTENCE_MIN_CHARS - 1)
    expect(firstSentenceEnd(`${short}\nmore text`, false)).toBeUndefined()
    const exact = 'x'.repeat(FIRST_SENTENCE_MIN_CHARS)
    expect(firstSentenceEnd(`${exact}\nmore`, false)).toEqual({
      end: FIRST_SENTENCE_MIN_CHARS,
      rule: 'line',
    })
  })

  test('a short answer with no boundary is its own first sentence at the end', () => {
    expect(firstSentenceEnd('Five direct reports', false)).toBeUndefined()
    expect(firstSentenceEnd('Five direct reports', true)).toEqual({
      end: 'Five direct reports'.length,
      rule: 'end',
    })
    expect(firstSentenceEnd('   ', true)).toBeUndefined()
  })
})

describe('createStreamTimeline', () => {
  test('stamps progress, first token and first sentence when each arrives', () => {
    const clock = manualClock()
    const timeline = createStreamTimeline(clock.now(), clock.now)
    clock.at(100)
    timeline.push(frame({ type: 'start' }))
    clock.at(2_500)
    timeline.push(frame({ type: PROGRESS_PART_TYPE, id: 'progress', data: {} }))
    clock.at(3_000)
    timeline.push(frame({ type: PROGRESS_PART_TYPE, id: 'progress', data: {} }))
    clock.at(9_000)
    timeline.push(frame({ type: 'text-delta', id: 't', delta: "Matt's team " }))
    clock.at(9_050)
    timeline.push(
      frame({
        type: 'text-delta',
        id: 't',
        delta: 'owns outbound email sending end to end at Thryv. It also',
      })
    )
    clock.at(9_400)
    timeline.push(frame({ type: 'finish' }) + 'data: [DONE]\n\n')
    clock.at(9_500)
    const timings = timeline.finish()
    expect(timings.firstProgressMs).toBe(2_500)
    expect(timings.firstAnswerTokenMs).toBe(9_000)
    expect(timings.firstSentenceMs).toBe(9_050)
    expect(timings.sentenceRule).toBe('punctuation')
    expect(timings.totalMs).toBe(9_500)
  })

  test('a frame split across chunks is stamped when its end arrives', () => {
    const clock = manualClock()
    const timeline = createStreamTimeline(clock.now(), clock.now)
    const whole = frame({ type: 'text-delta', id: 't', delta: LEAD + ' ' })
    clock.at(1_000)
    timeline.push(whole.slice(0, 20))
    clock.at(1_200)
    timeline.push(whole.slice(20))
    const timings = timeline.finish()
    expect(timings.firstAnswerTokenMs).toBe(1_200)
    expect(timings.firstSentenceMs).toBe(1_200)
  })

  test('an answer that never reaches a boundary is timed at its last token', () => {
    const clock = manualClock()
    const timeline = createStreamTimeline(clock.now(), clock.now)
    clock.at(4_000)
    timeline.push(frame({ type: 'text-delta', id: 't', delta: LEAD }))
    clock.at(7_000)
    timeline.push(frame({ type: 'finish' }))
    const timings = timeline.finish()
    expect(timings.firstSentenceMs).toBe(4_000)
    expect(timings.sentenceRule).toBe('punctuation')
    expect(timings.totalMs).toBe(7_000)
  })

  test('a run with no progress part and no text reports neither', () => {
    const clock = manualClock()
    const timeline = createStreamTimeline(clock.now(), clock.now)
    timeline.push(frame({ type: 'text-delta', id: 't', delta: '' }))
    timeline.push('data: not json\n')
    const timings = timeline.finish()
    expect(timings.firstProgressMs).toBeUndefined()
    expect(timings.firstAnswerTokenMs).toBeUndefined()
    expect(timings.firstSentenceMs).toBeUndefined()
    expect(timings.sentenceRule).toBe('none')
  })
})

describe('gradeDeterministic', () => {
  const context = {
    test: { metadata: { expectReads: ['resume'] } },
    metadata: { readIds: ['resume'] },
    vars: { question: 'Where is Matt based?' },
  }

  test('runs named assertions and substring checks, skips judged and live ones', async () => {
    const grade = await gradeDeterministic(
      [
        { type: 'javascript', value: 'file://assertions.ts:assertThirdPerson' },
        {
          type: 'javascript',
          value: 'file://assertions.ts:assertReadsExpected',
        },
        {
          type: 'javascript',
          value: 'file://assertions.ts:assertFollowUpsAnswerable',
        },
        { type: 'icontains-any', value: ['Phoenix', 'Arizona'] },
        { type: 'not-icontains', value: 'salary' },
        { type: 'assert-set', assert: [{ type: 'llm-rubric', value: 'x' }] },
      ],
      'Matt is based in Phoenix, Arizona.',
      context
    )
    expect(grade.failed).toEqual([])
    expect(grade.pass).toBe(true)
    expect(grade.skipped).toEqual([
      'assertFollowUpsAnswerable (live request)',
      'assert-set (llm-rubric)',
    ])
  })

  test('names each failure', async () => {
    const grade = await gradeDeterministic(
      [
        { type: 'icontains-any', value: ['Chicago'] },
        { type: 'icontains-all', value: ['Phoenix', 'remote'] },
        { type: 'javascript', value: 'file://assertions.ts:noSuchAssertion' },
      ],
      'Matt is based in Phoenix.',
      context
    )
    expect(grade.pass).toBe(false)
    expect(grade.failed).toEqual([
      'icontains-any: none of ["Chicago"]',
      'icontains-all: missing ["remote"]',
    ])
    expect(grade.skipped).toEqual([
      'javascript file://assertions.ts:noSuchAssertion',
    ])
  })
})

describe('nearestRank', () => {
  test('matches the runbook method', () => {
    const values = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10]
    expect(nearestRank(values, 50)).toBe(5)
    expect(nearestRank(values, 90)).toBe(9)
    expect(nearestRank(values, 95)).toBe(10)
    expect(nearestRank([], 50)).toBeUndefined()
  })
})
