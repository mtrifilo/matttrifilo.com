import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { CHAT_REASONING_LEVELS } from '@/lib/chat/validate'

/**
 * Run the smoke subset at each Gemini 3.8 Flash thinking level.
 *
 * The live route defaults to `medium`. This is how to check whether `low`
 * or `high` would have scored the same twelve tests differently, without
 * spending a full 102-test run three times. CI does not run it.
 *
 *   bun run evals:compare
 *
 * Unset the four Vercel federation variables first, the same as a local
 * `bun run evals:smoke`.
 */

const LEVELS = CHAT_REASONING_LEVELS

interface LevelResult {
  level: (typeof LEVELS)[number]
  passed: number
  total: number
  status: number
}

async function runLevel(level: (typeof LEVELS)[number]): Promise<LevelResult> {
  const output = `evals/out/compare-${level}.json`
  const child = spawn(
    'bun',
    [
      'x',
      'promptfoo',
      'eval',
      '-c',
      'evals/promptfooconfig.yaml',
      '--max-concurrency',
      '2',
      '--filter-metadata',
      'smoke=true',
      '--output',
      output,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        CHAT_REASONING: level,
        PROMPTFOO_CACHE_ENABLED: 'false',
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: '1',
      },
    }
  )
  const status: number = await new Promise(resolve => {
    child.on('close', code => resolve(code ?? 1))
  })
  const results = await Bun.file(output)
    .json()
    .catch(() => null)
  const rows = (results?.results?.results ?? []) as { success?: boolean }[]
  return {
    level,
    passed: rows.filter(row => row.success === true).length,
    total: rows.length,
    status,
  }
}

mkdirSync('evals/out', { recursive: true })
const results: LevelResult[] = []
for (const level of LEVELS) {
  console.log(`\n=== thinking ${level} ===\n`)
  results.push(await runLevel(level))
}

console.log('\nThinking level comparison (smoke subset)\n')
console.log('| Level | Passed | Total |')
console.log('| --- | ---: | ---: |')
for (const result of results) {
  console.log(`| ${result.level} | ${result.passed} | ${result.total} |`)
}

if (results.some(result => result.total === 0 || result.passed < result.total)) {
  process.exit(1)
}
