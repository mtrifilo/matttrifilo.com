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
 * streaming answer included, for every frame of it. The value it freezes on
 * is read from the clock at that moment, not from the last tick, so a run
 * that ended while the tab was backgrounded still reports its real length.
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
    // Structural only, because the clock may not be read during render:
    // starting zeroes the display, stopping holds whatever the last tick
    // wrote until the cleanup below corrects it.
    setRun(current => ({ ...current, active, ms: active ? 0 : current.ms }))
  }

  useEffect(() => {
    if (!active) return
    const startedAt = Date.now()
    // Measured against a timestamp rather than counted in ticks: a
    // background tab has its intervals throttled to about one a minute, and
    // a counter would lose every tick the tab slept through.
    const timer = setInterval(() => {
      setRun({ active: true, ms: Date.now() - startedAt })
    }, 1000)
    return () => {
      clearInterval(timer)
      // The run is over: read the clock once more, because the last tick can
      // be tens of seconds stale for exactly the same throttling reason, and
      // a frozen row that under-reports its own wait is the kind of wrong
      // this view exists to avoid.
      setRun({ active: false, ms: Date.now() - startedAt })
    }
  }, [active])

  return run.ms
}
