import { describe, expect, test } from 'bun:test'
import {
  CHAT_UNKNOWN_ERROR_MESSAGE,
  SOURCES_TRAILER_PREFIX,
  announcementFor,
  joinTextParts,
  stripSourcesTrailer,
  toAnswerView,
  toChatErrorView,
  type AnswerMessage,
} from './answer'
import { CHAT_ERROR_MESSAGE, chatErrorBody } from './validate'

const textPart = (text: string) => ({ type: 'text', text })

const answer = (
  parts: AnswerMessage['parts'],
  metadata?: AnswerMessage['metadata']
): AnswerMessage => ({ parts, metadata })

describe('joinTextParts', () => {
  test('concatenates the text parts in order', () => {
    expect(
      joinTextParts([textPart('Matt '), textPart('led '), textPart('it.')])
    ).toBe('Matt led it.')
  })

  test('ignores parts that are not text', () => {
    // The route filters non-text chunks server-side, so this is a backstop
    // rather than a case the UI expects to meet.
    expect(
      joinTextParts([
        { type: 'step-start' },
        textPart('Answer.'),
        { type: 'text' },
      ])
    ).toBe('Answer.')
  })
})

describe('stripSourcesTrailer', () => {
  test('removes the citation line the policy asks the model to write', () => {
    const text = `Matt shipped it.\n\n${SOURCES_TRAILER_PREFIX}resume, blog-agents`
    expect(stripSourcesTrailer(text)).toBe('Matt shipped it.')
  })

  test('removes a trailer that is the whole message', () => {
    expect(stripSourcesTrailer(`${SOURCES_TRAILER_PREFIX}resume`)).toBe('')
  })

  test('removes a trailer as soon as its prefix is complete', () => {
    // Mid-stream: the ids have not arrived yet, but the line is already
    // recognisable, so it never flashes up as prose.
    expect(stripSourcesTrailer('Matt shipped it.\nSources:')).toBe(
      'Matt shipped it.'
    )
  })

  test('leaves an answer that merely mentions sources alone', () => {
    const text = 'Sources for that claim are named in the résumé.'
    expect(stripSourcesTrailer(text)).toBe(text)
  })

  test('leaves a bullet that starts with S alone', () => {
    const text = 'He led two teams:\n\n- Shipped the eval suite'
    expect(stripSourcesTrailer(text)).toBe(text)
  })

  test('only takes the final line', () => {
    const text = `${SOURCES_TRAILER_PREFIX}resume\n\nAnd then he shipped it.`
    expect(stripSourcesTrailer(text)).toBe(text)
  })
})

describe('toAnswerView', () => {
  test('reads the text, the chips and neither flag from a clean answer', () => {
    const view = toAnswerView(
      answer([textPart(`Matt shipped it.\n${SOURCES_TRAILER_PREFIX}resume`)], {
        sources: [
          { id: 'resume', title: 'Résumé', url: '/knowledge/resume' },
        ],
      })
    )
    expect(view).toEqual({
      text: 'Matt shipped it.',
      sources: [{ id: 'resume', title: 'Résumé', url: '/knowledge/resume' }],
      truncated: false,
      incomplete: false,
    })
  })

  test('has no chips when the server sent none', () => {
    // A decline, and any run that produced no answer, arrive without sources.
    const view = toAnswerView(answer([textPart("That isn't something…")]))
    expect(view.sources).toEqual([])
    expect(view.incomplete).toBe(false)
  })

  test('reports a cut-short answer as both truncated and incomplete', () => {
    const view = toAnswerView(
      answer([textPart('Matt led the mig')], {
        truncated: true,
        incomplete: true,
      })
    )
    expect(view.truncated).toBe(true)
    expect(view.incomplete).toBe(true)
    expect(view.text).toBe('Matt led the mig')
  })

  test('reports a run that never answered as incomplete with no text', () => {
    const view = toAnswerView(answer([], { incomplete: true }))
    expect(view).toEqual({
      text: '',
      sources: [],
      truncated: false,
      incomplete: true,
    })
  })
})

describe('announcementFor', () => {
  test('says nothing on a page nobody has asked anything on yet', () => {
    expect(announcementFor('ready', false)).toBe('')
  })

  test('announces the wait and the stream the same way', () => {
    expect(announcementFor('submitted', false)).toBe('Responding')
    expect(announcementFor('streaming', false)).toBe('Responding')
  })

  test('announces completion once an answer exists', () => {
    expect(announcementFor('ready', true)).toBe('Response complete')
  })

  test('announces a failure over anything else', () => {
    expect(announcementFor('error', true)).toBe('Error')
  })
})

describe('toChatErrorView', () => {
  test('is undefined when there is no error', () => {
    expect(toChatErrorView(undefined)).toBeUndefined()
  })

  test.each([
    'disabled',
    'too_many_turns',
    'message_too_long',
    'budget_exceeded',
    'invalid',
    'unavailable',
  ] as const)('renders the route\'s own copy for %s', code => {
    // The transport rejects a non-2xx response with the raw body as the
    // message, so this is exactly what useChat hands the UI.
    const error = new Error(JSON.stringify(chatErrorBody(code)))
    expect(toChatErrorView(error)).toEqual({
      code,
      message: CHAT_ERROR_MESSAGE[code],
    })
  })

  test('recognises rate_limited, which MTC-34 will start sending', () => {
    const error = new Error(
      JSON.stringify({ error: { code: 'rate_limited', message: 'Slow down.' } })
    )
    expect(toChatErrorView(error)?.code).toBe('rate_limited')
  })

  test('falls back for a code this build does not know', () => {
    const error = new Error(
      JSON.stringify({ error: { code: 'teapot', message: 'Short and stout.' } })
    )
    expect(toChatErrorView(error)).toEqual({
      code: 'unavailable',
      message: CHAT_UNKNOWN_ERROR_MESSAGE,
    })
  })

  test.each([
    ['a transport failure', 'Failed to fetch the chat response.'],
    ['a browser network failure', 'Failed to fetch'],
    ['an HTML error page', '<!doctype html><title>502</title>'],
    ['an empty message', ''],
  ])('falls back for %s', (_name, message) => {
    // None of these were written by this route, so none of them is copy.
    expect(toChatErrorView(new Error(message))).toEqual({
      code: 'unavailable',
      message: CHAT_UNKNOWN_ERROR_MESSAGE,
    })
  })

  test('falls back when the body parses but has no message', () => {
    const error = new Error(JSON.stringify({ error: { code: 'disabled' } }))
    expect(toChatErrorView(error)?.message).toBe(CHAT_UNKNOWN_ERROR_MESSAGE)
  })
})
