'use client'

import { useEffect, useState } from 'react'

/**
 * Wall-clock milliseconds since the current run started (MTC-42).
 *
 * The timer is the part of the in-progress view that makes a long wait
 * bearable: it says the assistant is still working rather than stuck. So it
 * has to behave like a stopwatch and not like an animation: it starts at
 * zero, it ticks once a second, and when the run ends it *stops*, holding the
 * number the run actually took. A ticking timer over a finished or failed run
 * would be the same lie the rest of MTC-42 is built to avoid.
 *
 * Once a second, deliberately. Sub-second precision buys nothing a visitor
 * can read, and a 60 Hz counter would re-render the whole transcript, the
 * streaming answer included, for every frame of it.
 *
 * The reset is done in render rather than in an effect. React's rule for
 * adjusting state when a prop changes, and the repo's lint enforces the other
 * half of it: a synchronous `setState` inside an effect body is an error
 * (`react-hooks/set-state-in-effect`). Resetting here also means a new run
 * shows `0s` in the same commit that starts it, instead of the previous run's
 * frozen total for the first second.
 */
export function useElapsed(active: boolean): number {
  // One state, holding both halves, so the two can never disagree about
  // which run the milliseconds belong to.
  const [run, setRun] = useState({ active: false, ms: 0 })
  if (run.active !== active) {
    // Starting: back to zero. Stopping: keep what the last tick recorded.
    setRun({ active, ms: active ? 0 : run.ms })
  }

  useEffect(() => {
    if (!active) return
    const startedAt = Date.now()
    // Measured against a timestamp rather than counted in ticks: an interval
    // that a background tab throttled would otherwise under-report the wait
    // by however long the tab was asleep.
    const timer = setInterval(() => {
      setRun({ active: true, ms: Date.now() - startedAt })
    }, 1000)
    return () => clearInterval(timer)
  }, [active])

  return run.ms
}
