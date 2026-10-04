import { afterEach, describe, expect, test } from 'bun:test'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DECLINE_SENTENCE } from '@/lib/chat/answer'
import { repositoryDeclineSentence } from '@/lib/chat/prompt'
import { ASSISTANT_REPOSITORIES } from '@/lib/chat/repositories'
import { openStream, type OpenStream } from '@/test/chat-stream'
import { AssistantChat } from './assistant-chat'

/**
 * A bare address in an answer is a link only once all of it has arrived
 * (Matt, 2026-10-04, MTC-117): never, for a chunk, a live link to a truncated
 * address. The two addresses an answer carries today are the decline's email
 * address and a repository decline's URL (MTC-115); each is streamed here
 * through the real transcript, split where a model's chunks can split it.
 */

const COMPOSER = "Ask a question about Matt's work"
const EMAIL = 'matt.trifilo@gmail.com'
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  sessionStorage.clear()
})

async function streamingAnswer(): Promise<OpenStream> {
  const stream = openStream()
  globalThis.fetch = (() =>
    Promise.resolve(stream.response)) as unknown as typeof fetch
  render(<AssistantChat />)
  fireEvent.change(screen.getByRole('textbox', { name: COMPOSER }), {
    target: { value: 'What is Matt like as a person?' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
  await send(stream, { type: 'start' }, { type: 'text-start', id: 't' })
  return stream
}

async function send(stream: OpenStream, ...chunks: unknown[]): Promise<void> {
  await act(async () => {
    for (const chunk of chunks) stream.push(chunk)
  })
}

/** Sends one piece of the answer and waits until the transcript shows it. */
async function sendText(stream: OpenStream, delta: string): Promise<void> {
  await send(stream, { type: 'text-delta', id: 't', delta })
  const tail = delta.trim().slice(-12)
  await waitFor(() => expect(answerText()).toContain(tail))
}

async function endRun(stream: OpenStream): Promise<void> {
  await send(stream, { type: 'text-end', id: 't' }, { type: 'finish' })
  await act(async () => stream.close())
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeNull()
  )
}

function answerText(): string {
  return document.querySelector('.is-assistant')?.textContent ?? ''
}

function answerLinks(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.is-assistant a[href]'),
    link => link.getAttribute('href') ?? ''
  )
}

describe('a bare address streamed into an answer', () => {
  test('is not a link after the chunk that cuts it, and links the whole address after the chunk that finishes it', async () => {
    const stream = await streamingAnswer()
    const cut = DECLINE_SENTENCE.indexOf(EMAIL) + 'matt.trifilo@gmail.c'.length

    await sendText(stream, DECLINE_SENTENCE.slice(0, cut))
    expect(answerText()).toContain('matt.trifilo@gmail.c')
    expect(answerLinks()).toEqual([])

    await sendText(stream, `${DECLINE_SENTENCE.slice(cut)} `)
    expect(answerLinks()).toEqual([`mailto:${EMAIL}`])

    await endRun(stream)
    expect(answerLinks()).toEqual([`mailto:${EMAIL}`])
  })

  test.each(
    ASSISTANT_REPOSITORIES.map(repository => [repository.id, repository])
  )(
    'as the last word of a decline about %s, is a link to the whole URL once the stream ends',
    async (_id, repository) => {
      const stream = await streamingAnswer()
      const sentence = repositoryDeclineSentence(repository)
      const cut = sentence.indexOf(repository.url) + repository.url.length - 3

      await sendText(stream, `${DECLINE_SENTENCE} ${sentence.slice(0, cut)}`)
      expect(answerLinks()).toEqual([`mailto:${EMAIL}`])

      // The whole sentence has arrived, closing period and all, and nothing
      // follows it yet: the address could still be growing.
      await sendText(stream, sentence.slice(cut))
      expect(answerText()).toContain(sentence)
      expect(answerLinks()).toEqual([`mailto:${EMAIL}`])

      await endRun(stream)
      expect(answerLinks()).toEqual([`mailto:${EMAIL}`, repository.url])
    }
  )

  test('stays a link, once finished, while the trailers after it stream', async () => {
    // The trailers are taken off the answer's text, so the address ends the
    // text again while they arrive; it is finished all the same.
    const stream = await streamingAnswer()
    await sendText(stream, `You can reach him at ${EMAIL}.\n\n`)
    await waitFor(() => expect(answerLinks()).toEqual([`mailto:${EMAIL}`]))

    const seen: string[][] = []
    const observer = new MutationObserver(() => seen.push(answerLinks()))
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    })
    for (const delta of [
      'S',
      'ources: contact',
      '\nFollow-u',
      'ps:\nHow does he run his team?',
    ]) {
      await send(stream, { type: 'text-delta', id: 't', delta })
    }
    await endRun(stream)
    observer.disconnect()

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.filter(links => links.length !== 1)).toEqual([])
    expect(answerLinks()).toEqual([`mailto:${EMAIL}`])
  })

  test('is not a link when the stream stops on a period inside it', async () => {
    // GFM leaves a trailing period out of a bare URL, so this chunk alone
    // would link https://github.com/mtrifilo/matttrifilo, which is not the
    // repository being named. The period is the URL's own; only ".com" says
    // so.
    const repository = ASSISTANT_REPOSITORIES.find(
      candidate => candidate.id === 'matttrifilo.com'
    )
    expect(repository).toBeDefined()
    const url = repository?.url ?? ''
    const stream = await streamingAnswer()

    await sendText(
      stream,
      `The code is public at ${url.slice(0, -'com'.length)}`
    )
    expect(answerLinks()).toEqual([])

    await sendText(stream, 'com. It holds this site.')
    expect(answerLinks()).toEqual([url])
  })
})
