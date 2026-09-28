import { mkdirSync, writeFileSync } from 'node:fs'
import { GoogleAuth } from 'google-auth-library'
import { STARTER_QUESTIONS } from '@/components/assistant/copy'
import { usesVercelFederation } from '@/lib/ai/vertex'
import { DEFAULT_CHAT_REASONING, type ChatReasoning } from '@/lib/chat/validate'
import type { SuiteTestMetadata } from './assertions'
import {
  createStreamTimeline,
  gradeDeterministic,
  nearestRank,
  type DeterministicGrade,
  type StreamTimings,
  type SuiteAssertion,
} from './first-sentence'
import { createEvalChatSession } from './provider'
import { chatRequest } from './route-request'

/**
 * How long a visitor waits for the first useful sentence, per thinking level
 * (MTC-87).
 *
 *   GCP_PROJECT_ID=<project> VERTEX_PROJECT_ID=<project> \
 *     bun run evals/measure-first-sentence.ts
 *
 * Each request goes through the eval provider's own handler construction
 * (`createEvalChatSession`), in process, with no server: the same policy,
 * read budget, step cap and stream filters the route runs. The stream is read
 * as it arrives and stamped at the first progress part, the first answer
 * token, and the first complete sentence (evals/first-sentence.ts), then
 * graded on its golden's deterministic assertions.
 *
 * What it cannot measure: Vercel's egress and cold starts, the browser's own
 * rendering, and the per-request ADC token exchange a local run pays and a
 * deployment's shared federated client mostly does not. The runbook section
 * "Time to the first useful sentence" says how to read the numbers.
 *
 * Spend: QUESTIONS x LEVELS x REPETITIONS requests (60), no retries, and it
 * stops starting new requests at the first CHAT_ERROR, because a stalled
 * Vertex hour measures Vertex, not the thinking level.
 */

/**
 * Ten starter questions: the four that open the homepage's rows, one per
 * featured theme, then six more spread across the themes and the untagged
 * group. Every one has a golden. The labels are for the table only.
 */
const QUESTIONS: readonly { label: string; question: string }[] = [
  {
    label: 'head: measured results',
    question:
      "What measurable results did Matt's team get from adopting AI coding agents?",
  },
  {
    label: 'head: engagement summary',
    question: 'What is the AI Email Engagement Summary feature Matt built?',
  },
  {
    label: 'head: team owns',
    question: "What does Matt's Email Reliability team own at Thryv?",
  },
  {
    label: 'head: org AI rollout',
    question:
      "How did Matt roll out AI tooling and best practices across Thryv's engineering org?",
  },
  {
    label: 'quality with agents',
    question:
      'How does Matt keep quality high when AI agents write most of the code?',
  },
  {
    label: 'Symphony',
    question: 'What is Symphony, and what did Matt do with it?',
  },
  {
    label: 'Feb 2024 outage',
    question: 'How did Matt handle the February 2024 cloud-provider outage?',
  },
  {
    label: 'uses coding agents',
    question: 'How does Matt use AI coding agents?',
  },
  { label: 'shipped recently', question: 'What did Matt ship recently?' },
  {
    label: 'location, relocating',
    question: 'Where is Matt based, and is he open to relocating?',
  },
]

const LEVELS: readonly ChatReasoning[] = ['low', 'medium']
const REPETITIONS = 3
const CONCURRENCY = 2

interface Job {
  label: string
  question: string
  level: ChatReasoning
  repetition: number
}

interface Measurement extends Job, Omit<StreamTimings, 'text'> {
  status: number
  error?: string
  /** The slowest first byte, the same figure as `vertexFirstByteMs`. */
  vertexFirstByteMs: number
  /** Every model call's first byte, in arrival order. */
  firstBytesMs: readonly number[]
  vertexRetries: number
  documentsRead: number
  grade?: DeterministicGrade
  answer: string
}

interface GoldenTest {
  vars?: { question?: unknown }
  metadata?: SuiteTestMetadata
  assert?: SuiteAssertion[]
}

async function loadGoldens(): Promise<Map<string, GoldenTest>> {
  const tests = Bun.YAML.parse(
    await Bun.file('evals/suites/golden.yaml').text()
  ) as GoldenTest[]
  const byQuestion = new Map<string, GoldenTest>()
  for (const test of tests) {
    const question = test.vars?.question
    if (typeof question === 'string' && !byQuestion.has(question)) {
      byQuestion.set(question, test)
    }
  }
  return byQuestion
}

async function loadDefaultAsserts(): Promise<SuiteAssertion[]> {
  const config = Bun.YAML.parse(
    await Bun.file('evals/promptfooconfig.yaml').text()
  ) as { defaultTest?: { assert?: SuiteAssertion[] } }
  return config.defaultTest?.assert ?? []
}

/**
 * Time a fresh ADC token exchange, which each local request pays once
 * because the provider's client builds its own GoogleAuth. No model call.
 */
async function adcTokenMs(): Promise<number> {
  const started = performance.now()
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  await client.getAccessToken()
  return Math.round(performance.now() - started)
}

async function measure(
  job: Job,
  goldens: Map<string, GoldenTest>,
  defaultAsserts: SuiteAssertion[]
): Promise<Measurement> {
  const session = createEvalChatSession({
    ...process.env,
    CHAT_REASONING: job.level,
  })
  const decoder = new TextDecoder()
  const started = performance.now()
  const timeline = createStreamTimeline(started, () => performance.now())
  const response = await session.handler(chatRequest(job.question, []))
  let body = ''
  if (response.body) {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      body += text
      timeline.push(text)
    }
    const rest = decoder.decode()
    body += rest
    timeline.push(rest)
  }
  const { text, ...timings } = timeline.finish()
  const { response: result } = session.read(response, body, 1)
  const firstBytesMs = session.firstByteMs()
  const metadata = result.metadata

  let grade: DeterministicGrade | undefined
  const golden = goldens.get(job.question)
  if (golden && !result.error) {
    grade = await gradeDeterministic(
      [...defaultAsserts, ...(golden.assert ?? [])],
      result.output,
      {
        test: { metadata: golden.metadata },
        metadata,
        vars: { question: job.question },
      }
    )
  }

  return {
    ...job,
    ...roundTimings(timings),
    status: response.status,
    ...(result.error ? { error: result.error } : {}),
    vertexFirstByteMs: Math.max(0, ...firstBytesMs),
    firstBytesMs,
    vertexRetries: session.vertexRetries(),
    documentsRead: metadata?.readIds.length ?? 0,
    ...(grade ? { grade } : {}),
    answer: text,
  }
}

function roundTimings(
  timings: Omit<StreamTimings, 'text'>
): Omit<StreamTimings, 'text'> {
  const round = (ms: number | undefined) =>
    ms === undefined ? undefined : Math.round(ms)
  return {
    ...(timings.firstProgressMs !== undefined
      ? { firstProgressMs: round(timings.firstProgressMs) }
      : {}),
    ...(timings.firstAnswerTokenMs !== undefined
      ? { firstAnswerTokenMs: round(timings.firstAnswerTokenMs) }
      : {}),
    ...(timings.firstSentenceMs !== undefined
      ? { firstSentenceMs: round(timings.firstSentenceMs) }
      : {}),
    sentenceRule: timings.sentenceRule,
    totalMs: Math.round(timings.totalMs),
  }
}

/**
 * Interleaved so each level sees the same minutes of Vertex: with two
 * workers, the low and medium runs of one question start together.
 */
function schedule(): Job[] {
  const jobs: Job[] = []
  for (let repetition = 1; repetition <= REPETITIONS; repetition++) {
    for (const { label, question } of QUESTIONS) {
      for (const level of LEVELS) {
        jobs.push({ label, question, level, repetition })
      }
    }
  }
  return jobs
}

const ms = (value: number | undefined) =>
  value === undefined ? 'n/a' : value.toLocaleString('en-US')

function requestTable(rows: readonly Measurement[]): string {
  const lines = [
    '| level | question | rep | progress | first token | first sentence | rule | total | first byte (max) | first bytes per call | docs | retries | golden (deterministic) |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: | --- |',
  ]
  for (const row of rows) {
    const golden = row.error
      ? row.error
      : row.grade
        ? row.grade.pass
          ? 'pass'
          : `FAIL (${row.grade.failed.length})`
        : 'no golden'
    lines.push(
      `| ${row.level} | ${row.label} | ${row.repetition} | ${ms(row.firstProgressMs)} | ${ms(row.firstAnswerTokenMs)} | ${ms(row.firstSentenceMs)} | ${row.sentenceRule} | ${ms(row.totalMs)} | ${ms(row.vertexFirstByteMs)} | ${row.firstBytesMs.map(value => ms(value)).join(', ')} | ${row.documentsRead} | ${row.vertexRetries} | ${golden} |`
    )
  }
  return lines.join('\n')
}

function summaryTable(rows: readonly Measurement[]): string {
  const lines = [
    '| level | measure | n | p50 | p90 | max |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ]
  for (const level of LEVELS) {
    const ofLevel = rows.filter(row => row.level === level && !row.error)
    const series: [string, (row: Measurement) => number | undefined][] = [
      ['first progress part', row => row.firstProgressMs],
      ['first answer token', row => row.firstAnswerTokenMs],
      ['first complete sentence', row => row.firstSentenceMs],
      ['total', row => row.totalMs],
      ['vertexFirstByteMs (slowest call)', row => row.vertexFirstByteMs],
      ['first call first byte', row => row.firstBytesMs[0]],
      ['documents read', row => row.documentsRead],
    ]
    for (const [name, pick] of series) {
      const values = ofLevel
        .map(pick)
        .filter((value): value is number => value !== undefined)
      lines.push(
        `| ${level} | ${name} | ${values.length} | ${ms(nearestRank(values, 50))} | ${ms(nearestRank(values, 90))} | ${ms(values.length ? Math.max(...values) : undefined)} |`
      )
    }
  }
  return lines.join('\n')
}

function passTable(rows: readonly Measurement[]): string {
  const lines = [
    '| level | requests | golden deterministic pass | no progress part | sentence rule: punctuation / line / end / none |',
    '| --- | ---: | ---: | ---: | --- |',
  ]
  for (const level of LEVELS) {
    const ofLevel = rows.filter(row => row.level === level)
    const graded = ofLevel.filter(row => row.grade)
    const passed = graded.filter(row => row.grade?.pass)
    const rule = (name: string) =>
      ofLevel.filter(row => row.sentenceRule === name).length
    lines.push(
      `| ${level} | ${ofLevel.length} | ${passed.length} of ${graded.length} | ${ofLevel.filter(row => row.firstProgressMs === undefined).length} | ${rule('punctuation')} / ${rule('line')} / ${rule('end')} / ${rule('none')} |`
    )
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  // The provider asks this before building a handler, for the reason given
  // there: a partial federation set would otherwise fail every request as
  // `unavailable`.
  usesVercelFederation()
  for (const { question } of QUESTIONS) {
    if (!(STARTER_QUESTIONS as readonly string[]).includes(question)) {
      throw new Error(`not a starter question any more: ${question}`)
    }
  }
  const goldens = await loadGoldens()
  const defaultAsserts = await loadDefaultAsserts()

  // Token totals from the route's own completion lines, for the cost of the
  // run. Summed, not attributed: two requests are in flight at once.
  const tokens = { input: 0, output: 0, cached: 0, lines: 0 }
  const info = console.info.bind(console)
  console.info = (...args: unknown[]) => {
    const [tag, fields] = args as [unknown, Record<string, unknown>?]
    if (tag === '[chat]' && typeof fields?.inputTokens === 'number') {
      tokens.input += fields.inputTokens
      tokens.output += Number(fields.outputTokens ?? 0)
      tokens.cached += Number(fields.cachedInputTokens ?? 0)
      tokens.lines += 1
    }
    info(...args)
  }

  const tokenSamples = [await adcTokenMs(), await adcTokenMs()]
  const jobs = schedule()
  const results: Measurement[] = []
  let stopped: string | undefined
  let next = 0
  const startedAt = new Date().toISOString()

  async function worker(): Promise<void> {
    while (stopped === undefined && next < jobs.length) {
      const job = jobs[next++]
      try {
        const result = await measure(job, goldens, defaultAsserts)
        results.push(result)
        process.stderr.write(
          `[measure] ${results.length}/${jobs.length} ${job.level} ${job.label} #${job.repetition}: sentence ${ms(result.firstSentenceMs)} ms${result.error ? ` ${result.error}` : ''}\n`
        )
        if (result.error?.startsWith('CHAT_ERROR')) {
          stopped = `${result.error} on ${job.level} "${job.label}" #${job.repetition}`
        }
      } catch (error) {
        stopped = `threw on ${job.level} "${job.label}" #${job.repetition}: ${String(error)}`
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.info = info

  const ordered = [...results].sort(
    (a, b) =>
      LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) ||
      QUESTIONS.findIndex(q => q.question === a.question) -
        QUESTIONS.findIndex(q => q.question === b.question) ||
      a.repetition - b.repetition
  )

  mkdirSync('evals/out', { recursive: true })
  const outPath = `evals/out/first-sentence-${startedAt.replace(/[:.]/g, '-')}.json`
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        defaultLevel: DEFAULT_CHAT_REASONING,
        concurrency: CONCURRENCY,
        adcTokenMs: tokenSamples,
        tokens,
        stopped,
        results: ordered,
      },
      null,
      2
    )
  )

  console.log(`\nTime to the first useful sentence, in process, ${startedAt}`)
  console.log(
    `${results.length} of ${jobs.length} requests at concurrency ${CONCURRENCY}; the route default is ${DEFAULT_CHAT_REASONING}. All times in ms from the handler call.`
  )
  console.log(
    `A fresh ADC token exchange took ${tokenSamples.join(' and ')} ms here; each local request pays one.`
  )
  console.log(
    `Tokens across ${tokens.lines} completion lines: ${tokens.input.toLocaleString('en-US')} input (${tokens.cached.toLocaleString('en-US')} cached), ${tokens.output.toLocaleString('en-US')} output.\n`
  )
  console.log(summaryTable(ordered))
  console.log('')
  console.log(passTable(ordered))
  console.log('')
  console.log(requestTable(ordered))
  for (const row of ordered) {
    if (row.grade && !row.grade.pass) {
      console.log(
        `\n${row.level} ${row.label} #${row.repetition} failed: ${row.grade.failed.join('; ')}`
      )
    }
  }
  console.log(`\nWritten to ${outPath}`)
  if (stopped) {
    console.log(`\nSTOPPED: ${stopped}. No further requests were started.`)
    process.exit(1)
  }
}

await main()
