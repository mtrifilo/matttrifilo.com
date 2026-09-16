import { describe, expect, test } from 'bun:test'
import { announcementFor, type AnswerView } from './answer'
import {
  PROGRESS_PART_TYPE,
  progressStatus,
  progressSummary,
  toProgressView,
  type ChatProgressPhase,
  type ProgressView,
} from './progress'

/** A message part as the AI SDK client holds it after a progress chunk. */
const progressPart = (data: unknown) => ({ type: PROGRESS_PART_TYPE, data })

const textPart = (text: string) => ({ type: 'text', text })

const step = (id: string, title: string) => ({ id, title })

/** An answer view with whatever progress the case is about. */
function viewWith(
  progress: ProgressView | undefined,
  text = 'He led the platform migration.'
): AnswerView {
  return { text, sources: [], truncated: false, incomplete: false, progress }
}

const reading = (...titles: string[]): ProgressView => ({
  phase: 'reading',
  steps: titles.map((title, i) => step(`doc-${i}`, title)),
})

const done = (count: number, ms: number): ProgressView => ({
  phase: 'done',
  steps: Array.from({ length: count }, (_, i) => step(`doc-${i}`, `Doc ${i}`)),
  ms,
})

describe('toProgressView', () => {
  test('reads a well-formed part', () => {
    expect(
      toProgressView([
        textPart('Answer.'),
        progressPart({
          phase: 'reading',
          steps: [step('resume', 'Résumé')],
        }),
      ])
    ).toEqual({ phase: 'reading', steps: [step('resume', 'Résumé')] })
  })

  test('keeps a numeric duration when the run finished', () => {
    expect(
      toProgressView([progressPart({ phase: 'done', steps: [], ms: 14_200 })])
    ).toEqual({ phase: 'done', steps: [], ms: 14_200 })
  })

  test('is undefined when the message carries no progress part', () => {
    expect(toProgressView([textPart('Answer.')])).toBeUndefined()
    expect(toProgressView([])).toBeUndefined()
  })

  test('rejects a phase that is not one of the three', () => {
    expect(
      toProgressView([progressPart({ phase: 'finished', steps: [] })])
    ).toBeUndefined()
    expect(toProgressView([progressPart({ steps: [] })])).toBeUndefined()
  })

  test('rejects steps that are not an array', () => {
    expect(
      toProgressView([progressPart({ phase: 'reading', steps: 'resume' })])
    ).toBeUndefined()
    expect(toProgressView([progressPart({ phase: 'reading' })])).toBeUndefined()
  })

  test('drops a step that does not name a document, and keeps the rest', () => {
    const view = toProgressView([
      progressPart({
        phase: 'reading',
        steps: [
          step('resume', 'Résumé'),
          { id: 'faq' },
          { title: 'FAQ' },
          { id: 7, title: 'Seven' },
          'faq',
          null,
          step('projects', 'Projects'),
        ],
      }),
    ])
    expect(view?.steps).toEqual([
      step('resume', 'Résumé'),
      step('projects', 'Projects'),
    ])
  })

  test('drops a step whose title is longer than any index title could be', () => {
    // Shown cut in half it would misname the document; left out, the count
    // is one lower and nothing on screen is wrong.
    const view = toProgressView([
      progressPart({
        phase: 'reading',
        steps: [step('resume', 'x'.repeat(201)), step('faq', 'y'.repeat(200))],
      }),
    ])
    expect(view?.steps).toEqual([step('faq', 'y'.repeat(200))])
  })

  test('rejects a duration that is not a real elapsed time', () => {
    for (const ms of [-1, Number.NaN, Number.POSITIVE_INFINITY, '14s', null]) {
      expect(
        toProgressView([progressPart({ phase: 'done', steps: [], ms })])
      ).toBeUndefined()
    }
  })

  test('rejects data that is not an object at all', () => {
    for (const data of [null, 'reading', 7, ['reading'], undefined]) {
      expect(toProgressView([progressPart(data)])).toBeUndefined()
    }
  })

  test('never throws on a part the stream left half-built', () => {
    const parts = [null, undefined, { type: PROGRESS_PART_TYPE }] as never
    expect(() => toProgressView(parts)).not.toThrow()
    expect(toProgressView(parts)).toBeUndefined()
  })
})

describe('progressStatus', () => {
  test('is thinking while a run that has said nothing yet is in flight', () => {
    expect(progressStatus(viewWith(undefined, ''), true)).toBe('thinking')
    expect(
      progressStatus(viewWith({ phase: 'reading', steps: [] }, ''), true)
    ).toBe('thinking')
  })

  test('reports the phase the server last sent while in flight', () => {
    expect(progressStatus(viewWith(reading('Résumé'), ''), true)).toBe(
      'reading'
    )
    expect(
      progressStatus(
        viewWith({ phase: 'writing', steps: [step('a', 'A')] }, ''),
        true
      )
    ).toBe('writing')
  })

  test('is done once the run has ended and said so', () => {
    expect(progressStatus(viewWith(done(3, 14_000)), false)).toBe('done')
  })

  test('is stopped when a run ended without saying it was done', () => {
    // A dropped stream, the transport's timeout, the visitor's Stop button,
    // a closed tab: none of them send a final phase, and none of them may
    // leave a spinner or a document count behind.
    expect(progressStatus(viewWith(reading('Résumé'), ''), false)).toBe(
      'stopped'
    )
    expect(
      progressStatus(
        viewWith({ phase: 'writing', steps: [step('a', 'A')] }, 'He led'),
        false
      )
    ).toBe('stopped')
  })

  test('is none when the server narrated nothing', () => {
    // A refusal before the stream opened, and an answer written with no
    // reads at all. Neither has anything to show.
    expect(progressStatus(viewWith(undefined), false)).toBe('none')
  })
})

describe('progressSummary', () => {
  test('counts the documents and the seconds', () => {
    expect(progressSummary(viewWith(done(3, 14_200)))).toBe(
      'Read 3 documents in 14s'
    )
  })

  test('says document, singular, for one', () => {
    expect(progressSummary(viewWith(done(1, 9_400)))).toBe(
      'Read 1 document in 9s'
    )
  })

  test('rounds to the nearest second, and never to none', () => {
    expect(progressSummary(viewWith(done(1, 9_600)))).toContain('10s')
    expect(progressSummary(viewWith(done(1, 400)))).toContain('1s')
    expect(progressSummary(viewWith(done(1, 0)))).toContain('1s')
  })

  test('claims nothing when the run produced no answer', () => {
    // The incomplete case: the reads happened, but "Read 3 documents" above
    // an empty reply describes work that came to nothing.
    expect(progressSummary(viewWith(done(3, 14_000), ''))).toBeUndefined()
    expect(progressSummary(viewWith(done(3, 14_000), '   '))).toBeUndefined()
  })

  test('claims nothing before the run has ended', () => {
    expect(progressSummary(viewWith(reading('Résumé')))).toBeUndefined()
    expect(
      progressSummary(viewWith({ phase: 'writing', steps: [step('a', 'A')] }))
    ).toBeUndefined()
  })

  test('claims nothing when nothing was read', () => {
    expect(progressSummary(viewWith(done(0, 4_000)))).toBeUndefined()
    expect(progressSummary(viewWith(undefined))).toBeUndefined()
  })

  test('a missing duration still reads as a real span, not zero', () => {
    const phase: ChatProgressPhase = 'done'
    expect(progressSummary(viewWith({ phase, steps: [step('a', 'A')] }))).toBe(
      'Read 1 document in 1s'
    )
  })
})

describe('announcementFor, with a run in flight', () => {
  test('names the document being read', () => {
    expect(announcementFor('streaming', false, reading('Résumé'))).toBe(
      'Reading Résumé'
    )
  })

  test('names the newest document, so each step announces once', () => {
    expect(announcementFor('streaming', false, reading('Résumé', 'FAQ'))).toBe(
      'Reading FAQ'
    )
  })

  test('says the answer is being written', () => {
    expect(
      announcementFor('streaming', false, {
        phase: 'writing',
        steps: [step('a', 'A')],
      })
    ).toBe('Writing answer')
  })

  test('falls back to the plain wait when there is no step yet', () => {
    expect(announcementFor('submitted', false)).toBe('Responding')
    expect(
      announcementFor('submitted', false, { phase: 'reading', steps: [] })
    ).toBe('Responding')
  })

  test('the finished and failed announcements are unchanged', () => {
    expect(announcementFor('ready', true, done(3, 14_000))).toBe(
      'Response complete'
    )
    expect(announcementFor('error', true, reading('Résumé'))).toBe('Error')
  })

  test('never announces the seconds', () => {
    // The region re-reads whenever this string changes; a counter in it
    // would re-announce every second and bury the steps.
    for (const text of [
      announcementFor('streaming', false, reading('Résumé')),
      announcementFor('ready', true, done(3, 14_000)),
    ]) {
      expect(text).not.toMatch(/\d/)
    }
  })
})
