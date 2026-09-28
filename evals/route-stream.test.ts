import { describe, expect, test } from 'bun:test'
import { stripTrailers } from '@/lib/chat/answer'
import {
  answerProse,
  hasNothingToGrade,
  parseUiMessageStream,
  sourcesTrailerIds,
  withoutQuotations,
} from './route-stream'

const sse = (chunks: unknown[]) =>
  `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n`).join('\n')}\ndata: [DONE]\n\n`

describe('parseUiMessageStream', () => {
  test('concatenates text deltas and keeps the finish metadata', () => {
    const answer = parseUiMessageStream(
      sse([
        { type: 'start' },
        { type: 'start-step' },
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'He led ' },
        { type: 'text-delta', id: '1', delta: 'the migration.' },
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: 'stop',
          messageMetadata: {
            followUps: ['What did he ship next?'],
          },
        },
      ])
    )

    expect(answer.text).toBe('He led the migration.')
    expect(answer.finishReason).toBe('stop')
    expect(answer.metadata.followUps).toEqual(['What did he ship next?'])
    expect(answer.errorText).toBeUndefined()
  })

  test('reports an error chunk without losing the text before it', () => {
    const answer = parseUiMessageStream(
      sse([
        { type: 'text-delta', id: '1', delta: 'partial' },
        { type: 'error', errorText: '{"error":{"code":"interrupted"}}' },
      ])
    )

    expect(answer.text).toBe('partial')
    expect(answer.errorText).toContain('interrupted')
  })

  test('merges metadata from every chunk that carries it', () => {
    const answer = parseUiMessageStream(
      sse([
        { type: 'message-metadata', messageMetadata: { truncated: true } },
        { type: 'finish', messageMetadata: { incomplete: true } },
      ])
    )

    expect(answer.metadata.truncated).toBe(true)
    expect(answer.metadata.incomplete).toBe(true)
  })

  test('ignores chunk types it does not know and unparseable frames', () => {
    const answer = parseUiMessageStream(
      [
        'data: {"type":"tool-output-available","output":"secret"}',
        'data: not json at all',
        ': a comment line',
        'data: {"type":"text-delta","id":"1","delta":"ok"}',
        'data: [DONE]',
      ].join('\n')
    )

    expect(answer.text).toBe('ok')
  })

  test('an empty body is an empty answer, not a throw', () => {
    expect(parseUiMessageStream('')).toEqual({ text: '', metadata: {} })
  })
})

describe('sourcesTrailerIds', () => {
  test('reads the ids off a final Sources line', () => {
    expect(sourcesTrailerIds('Text.\n\nSources: resume, faq')).toEqual([
      'resume',
      'faq',
    ])
  })

  test('tolerates a trailing full stop and stray whitespace', () => {
    expect(sourcesTrailerIds('Text.\nSources:  resume ,  faq. \n')).toEqual([
      'resume',
      'faq',
    ])
  })

  test('is empty when the answer has no trailer', () => {
    expect(sourcesTrailerIds('He led the migration.')).toEqual([])
    expect(sourcesTrailerIds('Sources of truth matter.')).toEqual([])
  })

  test('only the final line counts', () => {
    expect(sourcesTrailerIds('Sources: resume\nand then more prose')).toEqual(
      []
    )
  })
})

describe('the page and the suites agree on what a citation line is', () => {
  // Read from outside, as behaviour: the page hides the line when
  // `stripTrailers` takes it off, and a suite reads it when it yields ids and
  // leaves the line out of the prose it judges. A form on which the two
  // disagree is either raw ids on screen that no suite compared with the
  // reads, or a citation a suite checked that the visitor never saw hidden.
  const line = 'Sources: resume'
  const cases: [
    label: string,
    text: string,
    citation: string,
    read: boolean,
  ][] = [
    ['the canonical line', `He led it.\n\n${line}`, line, true],
    ['a line ending in a newline', `He led it.\n${line}\n\n`, line, true],
    ['a line indented by a space', `He led it.\n  ${line}`, line, true],
    [
      'a line with text after the ids',
      'He led it.\nSources: resume. See the dates there.',
      'Sources: resume. See the dates there.',
      true,
    ],
    [
      'a line above the follow-ups block',
      `He led it.\n${line}\nFollow-ups:\nWhat does his team own?`,
      line,
      true,
    ],
    [
      'a line above a half-written follow-ups marker',
      `He led it.\n${line}\nFollow`,
      line,
      true,
    ],
    [
      'a bold label',
      'He led it.\n**Sources:** resume',
      '**Sources:** resume',
      false,
    ],
    [
      'a lower-case label',
      'He led it.\nsources: resume',
      'sources: resume',
      false,
    ],
    [
      'an upper-case label',
      'He led it.\nSOURCES: resume',
      'SOURCES: resume',
      false,
    ],
    [
      'a heading',
      'He led it.\n## Sources: resume',
      '## Sources: resume',
      false,
    ],
    ['a singular label', 'He led it.\nSource: resume', 'Source: resume', false],
    [
      'a line that is not the last',
      `${line}\nAnd then more prose.`,
      line,
      false,
    ],
    [
      'a sentence that opens with the word',
      'He led it.\nSources of truth matter.',
      'Sources of truth matter.',
      false,
    ],
  ]

  test.each(cases)('%s', (_label, text, citation, read) => {
    expect({
      pageShows: stripTrailers(text).includes(citation),
      suiteReadsIds: sourcesTrailerIds(text).length > 0,
      suiteProseShows: answerProse(text).includes(citation),
    }).toEqual({
      pageShows: !read,
      suiteReadsIds: read,
      suiteProseShows: !read,
    })
  })
})

describe('answerProse', () => {
  test('drops the trailer and leaves everything else', () => {
    expect(answerProse('He led it.\n\nSources: resume')).toBe('He led it.')
    expect(answerProse('He led it.')).toBe('He led it.')
  })

  test('an answer that is only a trailer reduces to nothing', () => {
    expect(answerProse('Sources: resume')).toBe('')
  })
})

describe('the follow-ups block below the citation line', () => {
  const answered = [
    'He led it.',
    'Sources: resume',
    'Follow-ups:',
    'What does his team own?',
  ].join('\n')

  test('does not stop the citation ids being read', () => {
    // The Sources line is no longer the final line of an answer (MTC-41),
    // and the groundedness suite is built on reading it.
    expect(sourcesTrailerIds(answered)).toEqual(['resume'])
  })

  test('is not part of the prose an assertion judges', () => {
    expect(answerProse(answered)).toBe('He led it.')
  })

  test('comes off an answer that cited nothing', () => {
    expect(
      answerProse('He led it.\nFollow-ups:\nWhat does his team own?')
    ).toBe('He led it.')
  })
})

describe('withoutQuotations', () => {
  test('removes block quotes and quoted spans', () => {
    const text = [
      'Matt has written:',
      '> I have excelled at bringing teams together.',
      'He also said "my team owns the send path" in the essay.',
    ].join('\n')

    const stripped = withoutQuotations(text)
    expect(stripped).not.toContain('I have excelled')
    expect(stripped).not.toContain('my team')
    expect(stripped).toContain('He also said')
  })

  test('leaves unquoted prose alone', () => {
    expect(withoutQuotations('Matt led the migration.')).toBe(
      'Matt led the migration.'
    )
  })
})

describe('hasNothingToGrade', () => {
  test('false for an answer, with or without a trailer', () => {
    expect(hasNothingToGrade('He led the migration in 2024.')).toBe(false)
    expect(hasNothingToGrade('He led it.\n\nSources: resume')).toBe(false)
  })

  test('true for a row with no prose at all', () => {
    expect(hasNothingToGrade('')).toBe(true)
    expect(hasNothingToGrade('   \n')).toBe(true)
  })

  test('true for a trailer with no answer above it', () => {
    // The stream carried a citation line and nothing to cite.
    expect(hasNothingToGrade('Sources: resume')).toBe(true)
  })
})
