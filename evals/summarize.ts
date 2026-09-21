import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  allPassed,
  markdownTable,
  summarise,
  type ResultsFile,
} from './summary'

/**
 * Turn `evals/out/results.json` into `evals/out/summary.json` and a Markdown
 * table (MTC-32).
 *
 * The impure half of ./summary.ts: reads the results file, writes the
 * summary, appends the table to `$GITHUB_STEP_SUMMARY` when the runner set
 * one, and prints it either way so a local run sees the same thing. Exits
 * non-zero when any test failed, so a local `bun run evals` and a dispatched
 * workflow both end with the run's verdict as their exit code.
 *
 * Usage: bun run evals/summarize.ts [results.json] [summary.json]
 */

const [resultsArg, summaryArg] = process.argv.slice(2)
const resultsPath = resolve(resultsArg ?? 'evals/out/results.json')
const summaryPath = resolve(summaryArg ?? 'evals/out/summary.json')

if (!existsSync(resultsPath)) {
  // The run crashed before it wrote anything, so there is no verdict at all.
  // Say that rather than throwing a file-not-found stack at whoever opens the
  // job, and still exit non-zero: no results is not a pass.
  console.error(
    `no results at ${resultsPath}: the eval run did not get far enough to write one`
  )
  process.exit(1)
}

const results = JSON.parse(readFileSync(resultsPath, 'utf8')) as ResultsFile
const summary = summarise({
  results,
  commit: process.env.GITHUB_SHA ?? 'local',
  ranAt: new Date().toISOString(),
})

mkdirSync(dirname(summaryPath), { recursive: true })
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)

const table = markdownTable(summary)
console.log(table)

const stepSummary = process.env.GITHUB_STEP_SUMMARY
if (stepSummary) appendFileSync(stepSummary, `## Eval suites\n\n${table}\n\n`)

if (!allPassed(summary)) {
  console.error(
    `evals failed: ${summary.totals.total - summary.totals.passed} of ${summary.totals.total} tests did not pass`
  )
  process.exit(1)
}
