import { describe, expect, test } from 'bun:test'
import { announcementFor, type AnswerView } from './answer'
import {
  PROGRESS_PART_TYPE,
  STOPPED_BEFORE_FIRST_STEP,
  progressRows,
  progressSeconds,
  progressStatus,
  progressTotals,
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
  text = 'He led the platform migration.',
  flags: { truncated?: boolean; incomplete?: boolean } = {}
): AnswerView {
  return {
    text,
    truncated: flags.truncated ?? false,
    incomplete: flags.incomplete ?? false,
    progress,
  }
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

  test('a run stopped before its first step reads as stopped', () => {
    // The visitor pressed Stop while the header still said "Thinking...".
    // No assistant message was ever created, so the transcript hands this
    // view in for the placeholder row; it must not read as `none`, which
    // would leave the question sitting alone with nothing under it.
    expect(progressStatus(viewWith(STOPPED_BEFORE_FIRST_STEP, ''), false)).toBe(
      'stopped'
    )
    // While it is still running, the same view is the ordinary wait.
    expect(progressStatus(viewWith(STOPPED_BEFORE_FIRST_STEP, ''), true)).toBe(
      'thinking'
    )
  })

  test('is none when the server narrated nothing', () => {
    // A refusal before the stream opened, and an answer written with no
    // reads at all. Neither has anything to show.
    expect(progressStatus(viewWith(undefined), false)).toBe('none')
  })
})

describe('progressTotals', () => {
  test('counts the documents and the seconds', () => {
    expect(progressTotals(viewWith(done(3, 14_200)))).toEqual({
      count: 3,
      seconds: 14,
    })
  })

  test('rounds to the nearest second, and never to none', () => {
    expect(progressTotals(viewWith(done(1, 9_600)))?.seconds).toBe(10)
    expect(progressTotals(viewWith(done(1, 400)))?.seconds).toBe(1)
    expect(progressTotals(viewWith(done(1, 0)))?.seconds).toBe(1)
  })

  test('claims nothing when the run produced no answer', () => {
    // The incomplete case: the reads happened, but "Read 3 documents" above
    // an empty reply describes work that came to nothing.
    expect(progressTotals(viewWith(done(3, 14_000), ''))).toBeUndefined()
    expect(progressTotals(viewWith(done(3, 14_000), '   '))).toBeUndefined()
  })

  test('claims nothing before the run has ended', () => {
    expect(progressTotals(viewWith(reading('Résumé')))).toBeUndefined()
    expect(
      progressTotals(viewWith({ phase: 'writing', steps: [step('a', 'A')] }))
    ).toBeUndefined()
  })

  test('claims nothing when nothing was read', () => {
    expect(progressTotals(viewWith(done(0, 4_000)))).toBeUndefined()
    expect(progressTotals(viewWith(undefined))).toBeUndefined()
  })

  test('an answer cut off on the output cap keeps its count', () => {
    // `truncated` implies `incomplete`, but the text is real and was drawn
    // from the documents that were read, so the count is true. The rule is
    // about text, not about the flag, and this is the case that separates
    // the two readings.
    expect(
      progressTotals(
        viewWith(done(3, 14_000), 'He led the mig', {
          truncated: true,
          incomplete: true,
        })
      )
    ).toEqual({ count: 3, seconds: 14 })
  })

  test('a run flagged incomplete with no text claims nothing', () => {
    expect(
      progressTotals(viewWith(done(3, 14_000), '', { incomplete: true }))
    ).toBeUndefined()
  })

  test('a missing duration still counts as a real span, not zero', () => {
    const phase: ChatProgressPhase = 'done'
    expect(
      progressTotals(viewWith({ phase, steps: [step('a', 'A')] }))
    ).toEqual({ count: 1, seconds: 1 })
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

  test('a run that was cut off is never announced as complete', () => {
    // The only channel that reports the ending to a reader who cannot see
    // the steps: the transcript is deliberately not a live region and the
    // timer is hidden from assistive tech.
    expect(announcementFor('ready', true, reading('Résumé'))).toBe(
      'Response stopped'
    )
    expect(
      announcementFor('ready', true, { phase: 'writing', steps: [] })
    ).toBe('Response stopped')
    expect(announcementFor('ready', true, STOPPED_BEFORE_FIRST_STEP)).toBe(
      'Response stopped'
    )
  })

  test('an answer with no progress at all still completes', () => {
    // A run that read nothing narrates nothing, and it answered.
    expect(announcementFor('ready', true)).toBe('Response complete')
  })

  test('a stop is reported as stopped even when nothing was read', () => {
    // The SDK reports an abort as an ordinary `ready` with no error and no
    // metadata, and a run that answered without reading has no progress part
    // to read the ending from. Without the explicit signal this is the one
    // place "Response complete" gets said over a half-written sentence.
    expect(announcementFor('ready', true, undefined, true)).toBe(
      'Response stopped'
    )
    // And before the first chunk, where there is no assistant message yet.
    expect(
      announcementFor('ready', false, STOPPED_BEFORE_FIRST_STEP, true)
    ).toBe('Response stopped')
  })

  test('a page nobody has asked anything on stays silent', () => {
    expect(announcementFor('ready', false, undefined, false)).toBe('')
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

describe('progressRows', () => {
  const writing = (...titles: string[]): ProgressView => ({
    phase: 'writing',
    steps: titles.map((title, i) => step(`doc-${i}`, title)),
  })

  test('nothing read yet has no rows to show', () => {
    expect(progressRows('thinking', undefined)).toEqual([])
    expect(progressRows('thinking', { phase: 'reading', steps: [] })).toEqual(
      []
    )
    // The same holds for a run stopped before its first read: the headline
    // carries it, and there is no row to mark.
    expect(progressRows('stopped', STOPPED_BEFORE_FIRST_STEP)).toEqual([])
  })

  test('while reading, the newest document is the one in flight', () => {
    expect(progressRows('reading', reading('Résumé', 'FAQ'))).toEqual([
      { key: 'read:doc-0', title: 'Résumé', state: 'complete' },
      { key: 'read:doc-1', title: 'FAQ', state: 'active' },
    ])
  })

  test('while writing, every read is done and the answer is in flight', () => {
    expect(progressRows('writing', writing('Résumé'))).toEqual([
      { key: 'read:doc-0', title: 'Résumé', state: 'complete' },
      { key: 'writing', state: 'active' },
    ])
  })

  test('a finished run has nothing in flight', () => {
    // The state that must never spin: no `active` row survives a run that
    // ended.
    const rows = progressRows('done', { ...done(2, 9_000), phase: 'done' })
    expect(rows.every(row => row.state === 'complete')).toBe(true)
    expect(rows).toHaveLength(2)
  })

  test('a document named "writing" cannot collide with the answer row', () => {
    // Document ids are file names, so `writing.md` is a legal document. Two
    // rows sharing a React key would let a memoised step keep the wrong
    // label.
    const rows = progressRows('writing', {
      phase: 'writing',
      steps: [step('writing', 'Writing')],
    })
    expect(new Set(rows.map(row => row.key)).size).toBe(rows.length)
  })

  test('a stopped run marks where it stopped, and never spins', () => {
    const readingRows = progressRows('stopped', reading('Résumé', 'FAQ'))
    expect(readingRows.map(row => row.state)).toEqual(['complete', 'stopped'])

    const writingRows = progressRows('stopped', writing('Résumé'))
    expect(writingRows.map(row => row.state)).toEqual(['complete', 'stopped'])
    expect(writingRows.at(-1)?.title).toBeUndefined()
  })

  test('no run that has ended leaves a row in flight', () => {
    // The ticket's rule, asserted over every ended status rather than
    // spot-checked: a spinner after the fact is the thing to prevent.
    for (const status of ['done', 'stopped'] as const) {
      for (const progress of [reading('Résumé', 'FAQ'), writing('Résumé')]) {
        const rows = progressRows(status, progress)
        expect(rows.some(row => row.state === 'active')).toBe(false)
      }
    }
  })
})

describe('progressSeconds', () => {
  test('counts from zero rather than rounding a run up to one', () => {
    expect(progressSeconds(true, 0)).toBe(0)
    expect(progressSeconds(true, 400)).toBe(0)
    expect(progressSeconds(true, 600)).toBe(1)
    expect(progressSeconds(true, 14_200)).toBe(14)
  })

  test('an answer this tab is no longer timing shows no clock', () => {
    // An earlier turn in the transcript: a stale number beside it would be
    // worse than none.
    expect(progressSeconds(false, 0)).toBeUndefined()
  })

  test('a run that has ended keeps the time it took', () => {
    expect(progressSeconds(false, 12_400)).toBe(12)
  })
})
