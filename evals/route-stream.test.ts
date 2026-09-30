import { describe, expect, test } from 'bun:test'
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { joinTextParts, stripTrailers } from '@/lib/chat/answer'
import { createChatHandler } from '@/lib/chat/handler'
import { READ_DOCUMENT_TOOL_NAME } from '@/lib/chat/prompt'
import type { KnowledgeDocument } from '@/lib/knowledge'
import { chatRequest } from './route-request'
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
    expect(parseUiMessageStream('')).toEqual({
      text: '',
      retractions: 0,
      metadata: {},
    })
  })
})

describe('parseUiMessageStream, on a withdrawal (MTC-101)', () => {
  const step = (...deltas: string[]) => [
    { type: 'start-step' },
    { type: 'text-start', id: 't' },
    ...deltas.map(delta => ({ type: 'text-delta', id: 't', delta })),
  ]

  test('a reset takes back the text of its own step and no other', () => {
    const answer = parseUiMessageStream(
      sse([
        ...step('Kept from the first step. '),
        { type: 'text-end', id: 't' },
        ...step('Let me check ', 'his résumé.'),
        { type: 'reset-step' },
        ...step('He led the migration.'),
        { type: 'text-end', id: 't' },
      ])
    )

    expect(answer.text).toBe('Kept from the first step. He led the migration.')
    expect(answer.retractions).toBe(1)
  })

  test('a reset of a step that showed nothing counts no withdrawal', () => {
    const answer = parseUiMessageStream(
      sse([{ type: 'start-step' }, { type: 'reset-step' }, ...step('ok')])
    )

    expect(answer.text).toBe('ok')
    expect(answer.retractions).toBe(0)
  })

  test('a progress part first sent in the withdrawn step goes with it', () => {
    // The route never sends one before a reset in the same step; the
    // browser would drop it, so the parser reads the stream the same way.
    const part = {
      type: 'data-progress',
      id: 'progress',
      data: { phase: 'reading', steps: [{ id: 'resume', title: 'Résumé' }] },
    }
    expect(
      parseUiMessageStream(
        sse([{ type: 'start-step' }, part, { type: 'reset-step' }])
      ).progress
    ).toBeUndefined()
    expect(
      parseUiMessageStream(
        sse([
          { type: 'start-step' },
          part,
          { type: 'start-step' },
          { type: 'reset-step' },
        ])
      ).progress
    ).toEqual({ phase: 'reading', steps: [{ id: 'resume', title: 'Résumé' }] })
  })

  test('against the route: narration a call withdrew is not the answer', async () => {
    // The real handler over a model that narrates, reads, then answers. The
    // parser's text has to be the text the SDK's own reader leaves in the
    // browser, which is the answer alone.
    const answerText = 'He led the migration.\n\nSources: resume'
    const narration = 'Let me check his résumé first.'
    const usage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    }
    const finish = (unified: string) => ({
      type: 'finish',
      finishReason: { unified, raw: 'STOP' },
      usage,
    })
    const calls = [
      [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'n' },
        { type: 'text-delta', id: 'n', delta: narration },
        { type: 'text-end', id: 'n' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: READ_DOCUMENT_TOOL_NAME,
          input: JSON.stringify({ id: 'resume' }),
        },
        finish('tool-calls'),
      ],
      [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'a' },
        { type: 'text-delta', id: 'a', delta: answerText },
        { type: 'text-end', id: 'a' },
        finish('stop'),
      ],
    ]
    let call = 0
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: calls[Math.min(call++, calls.length - 1)] as never[],
          chunkDelayInMs: null,
          initialDelayInMs: null,
        }),
      }),
    })
    const resume: KnowledgeDocument = {
      id: 'resume',
      title: 'Résumé',
      summary: 'Where Matt has worked.',
      tags: [],
      topic: 'resume',
      source: 'resume',
      tokenEstimate: 10,
      text: 'Matt led the migration.',
      updated: '2026-09-01',
    }
    const { text: _text, updated: _updated, ...entry } = resume
    void _text
    void _updated
    const handler = createChatHandler({
      loadKnowledgeIndex: () => ({
        entries: [entry],
        text: '[resume] Résumé',
        tokenEstimate: 10,
        builtAt: '2026-09-29T00:00:00.000Z',
      }),
      readKnowledgeDocument: id => (id === 'resume' ? resume : undefined),
      model: () => model,
      verifyVisitor: async () => ({
        isBot: false,
        isVerifiedBot: false,
        bypassed: true,
      }),
      env: {},
      now: () => 0,
    })

    const info = console.info
    console.info = () => {}
    let body: string
    try {
      body = await (
        await handler(chatRequest('What did Matt build?', []))
      ).text()
    } finally {
      console.info = info
    }

    const answer = parseUiMessageStream(body)
    expect(body).toContain(narration)
    expect(answer.text).toBe(answerText)
    expect(answer.retractions).toBe(1)

    const chunks = body
      .split('\n')
      .filter(line => line.startsWith('data: ') && !line.includes('[DONE]'))
      .map(line => JSON.parse(line.slice('data: '.length)) as UIMessageChunk)
    let browser: UIMessage | undefined
    for await (const message of readUIMessageStream({
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk)
          controller.close()
        },
      }),
    })) {
      browser = message
    }
    expect(joinTextParts(browser?.parts ?? [])).toBe(answer.text)
  })
})

describe('parseUiMessageStream, on the progress part', () => {
  const progress = (steps: unknown[], phase = 'reading') => ({
    type: 'data-progress',
    id: 'progress',
    data: { steps, phase },
  })

  test('keeps the last part, which is the run after every refusal', () => {
    // The row for a refused read goes up at the call and is withdrawn when
    // the refusal arrives, so only the last part says what was read.
    const answer = parseUiMessageStream(
      sse([
        progress([
          { id: 'resume', title: 'Résumé' },
          { id: 'faq', title: 'FAQ' },
        ]),
        progress([{ id: 'resume', title: 'Résumé' }]),
        progress([{ id: 'resume', title: 'Résumé' }], 'done'),
      ])
    )

    expect(answer.progress).toEqual({
      phase: 'done',
      steps: [{ id: 'resume', title: 'Résumé' }],
    })
  })

  test('a malformed last part is no progress, not the one before it', () => {
    const answer = parseUiMessageStream(
      sse([
        progress([{ id: 'resume', title: 'Résumé' }]),
        { type: 'data-progress', id: 'progress', data: { phase: 'nonsense' } },
      ])
    )

    expect(answer.progress).toBeUndefined()
  })

  test('a run that narrated nothing has no progress', () => {
    expect(
      parseUiMessageStream(sse([{ type: 'text-delta', id: '1', delta: 'ok' }]))
        .progress
    ).toBeUndefined()
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
