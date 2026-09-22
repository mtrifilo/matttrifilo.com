import { describe, expect, test } from 'bun:test'
import {
  answerProse,
  answerQuality,
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
            sources: [{ id: 'resume', title: 'Résumé', url: '/r' }],
          },
        },
      ])
    )

    expect(answer.text).toBe('He led the migration.')
    expect(answer.finishReason).toBe('stop')
    expect(answer.metadata.sources).toEqual([
      { id: 'resume', title: 'Résumé', url: '/r' },
    ])
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

describe('answerQuality', () => {
  const answer = 'He led the migration in 2024.'

  test('flags nothing when a cited answer came back', () => {
    expect(answerQuality(`${answer}\n\nSources: resume`, ['resume'])).toEqual(
      {}
    )
  })

  test('flags nothing when the run read nothing and cited nothing', () => {
    // A decline reads no document, so it owes no trailer.
    expect(answerQuality(answer, [])).toEqual({})
  })

  test('flags an answer that used a document and did not cite it', () => {
    expect(answerQuality(answer, ['resume'])).toEqual({ missingTrailer: true })
  })

  test('flags a row with nothing to grade', () => {
    expect(answerQuality('', [])).toEqual({ transportFailure: true })
    expect(answerQuality('   \n', [])).toEqual({ transportFailure: true })
  })

  test('an answer cut off before it wrote anything is not a dropped citation', () => {
    // Both would otherwise be true, and the same row would count twice
    // against two different thresholds in the publish gate.
    expect(answerQuality('', ['resume'])).toEqual({ transportFailure: true })
  })

  test('a trailer with no prose above it is still nothing to grade', () => {
    expect(answerQuality('Sources: resume', ['resume'])).toEqual({
      transportFailure: true,
    })
  })
})
