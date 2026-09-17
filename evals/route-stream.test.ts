import { describe, expect, test } from 'bun:test'
import {
  answerProse,
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
