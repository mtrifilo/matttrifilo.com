'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type FocusEvent,
  type Ref,
} from 'react'
import { Suggestion } from '@/components/ai-elements/suggestion'
import { cn } from '@/lib/utils'
import { STARTER_QUESTIONS } from './copy'
import {
  loopSeconds,
  offsetForStartAt,
  progressForScrollLeft,
  revealScrollLeft,
  scrollLeftForProgress,
  TOUCH_PAUSE_MS,
} from './ticker-geometry'

/**
 * The starter questions, drifting (MTC-39).
 *
 * Three static pills could only ever show three questions, and the corpus
 * answers twenty-seven. The row shows the whole pool by moving: the pool is
 * rendered once as real buttons and once more as an inert copy behind it, and
 * a CSS keyframe slides the track by exactly one copy's width, so the frame
 * that ends the loop is the frame that starts it. Nothing here runs per
 * frame; the browser owns the motion, and app/globals.css owns the rules.
 *
 * Two things are worth reading twice.
 *
 * **Tab meets each question once.** Only the first copy holds real buttons.
 * The second is `aria-hidden`, and its buttons are `inert` with
 * `tabIndex={-1}`, so it exists for the eye and for nothing else.
 *
 * **A focused pill has to be visible**, and the track's transform is what
 * makes that hard: most of the row sits at negative offsets, which no scroll
 * position can reach. So focus freezes the track, hands its position over to
 * `scrollLeft`, and scrolls the pill clear of the edge fades; blur converts
 * back into a progress the animation resumes from. Both conversions go
 * through ticker-geometry.ts, which is why neither switch is visible.
 */

export interface StarterTickerProps {
  onPick: (question: string) => void
  /**
   * How far into the pool this row opens, as a fraction. Two surfaces show
   * the same pool in the same order, and this is what stops them showing the
   * same pills at the same moment.
   */
  startAt?: number
  className?: string
}

/**
 * Matt's to change: the group name a screen reader reads before the
 * questions. It lives here rather than in copy.ts because it labels this
 * markup, like the other labels the components carry.
 */
const TICKER_LABEL = 'Starter questions'

export function StarterTicker({
  onPick,
  startAt = 0,
  className,
}: StarterTickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  // The measured width of one copy of the pool. Everything the focus
  // handling computes is in these pixels, so it is read, never guessed.
  const copyWidthRef = useRef(0)
  const resumeRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // One loop is one copy's width, so the duration is what holds the speed
  // steady whatever the pool says. The width changes when the font arrives
  // and when the visitor zooms, and an observer catches both without asking
  // what caused them.
  useEffect(() => {
    const copy = copyRef.current
    const track = trackRef.current
    if (!copy || !track) return
    const measure = () => {
      const width = copy.getBoundingClientRect().width
      const seconds = loopSeconds(width)
      if (seconds === null) return
      copyWidthRef.current = width
      track.style.setProperty('--ticker-duration', `${seconds}s`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(copy)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => clearTimeout(resumeRef.current), [])

  const handleFocus = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const track = trackRef.current
    const focused = event.target
    const pill = focused instanceof Element ? focused.closest('button') : null
    if (!viewport || !track || !pill) return

    // Under reduced motion the row is an ordinary scroll container with
    // nothing to freeze, and the browser has already done this.
    if (prefersReducedMotion()) return

    if (track.dataset.frozen !== 'true') {
      const progress = animationProgress(track)
      const copyWidth = copyWidthRef.current
      if (progress === null || copyWidth <= 0) return
      // Freeze first: the rule that drops the animation also drops the
      // transform, and the scroll offset below replaces it exactly.
      track.dataset.frozen = 'true'
      viewport.scrollLeft = scrollLeftForProgress(progress, copyWidth)
    }

    viewport.scrollLeft = revealScrollLeft({
      scrollLeft: viewport.scrollLeft,
      viewportWidth: viewport.clientWidth,
      // The track is the pill's offset parent, so this is already the
      // coordinate scrollLeft is measured in.
      pillStart: pill.offsetLeft,
      pillWidth: pill.offsetWidth,
      fade: fadeWidth(viewport),
      maxScrollLeft: viewport.scrollWidth - viewport.clientWidth,
    })
  }, [])

  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track || track.dataset.frozen !== 'true') return
    // Tabbing from one pill to the next keeps the row frozen.
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    const progress = progressForScrollLeft(
      viewport.scrollLeft,
      copyWidthRef.current
    )
    viewport.scrollLeft = 0
    track.style.setProperty('--ticker-offset', String(progress))
    delete track.dataset.frozen
  }, [])

  // Pausing on touch is what keeps a moving pill from being a moving target.
  // It is not behind `pointer: coarse`, because a touchstart is itself the
  // evidence, and a touchscreen laptop reports a fine pointer.
  const handleTouchStart = useCallback(() => {
    const track = trackRef.current
    if (!track || prefersReducedMotion()) return
    track.dataset.touched = 'true'
    clearTimeout(resumeRef.current)
    resumeRef.current = setTimeout(() => {
      track.dataset.touched = 'false'
    }, TOUCH_PAUSE_MS)
  }, [])

  return (
    <div
      aria-label={TICKER_LABEL}
      // The vertical padding is room for a focus ring the row would
      // otherwise clip; the negative margin gives it back to the layout, so
      // the row occupies what the design says it does.
      className={cn('starter-ticker -my-1 w-full py-1', className)}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onTouchStart={handleTouchStart}
      ref={viewportRef}
      role="group"
    >
      <div
        className="starter-ticker-track"
        ref={trackRef}
        style={
          { '--ticker-offset': offsetForStartAt(startAt) } as CSSProperties
        }
      >
        <QuestionRow onPick={onPick} ref={copyRef} />
        <QuestionRow />
      </div>
    </div>
  )
}

/**
 * One pass of the pool. Called without `onPick` it is the trailing copy: no
 * handler, nothing focusable, nothing announced.
 */
function QuestionRow({
  onPick,
  ref,
}: {
  onPick?: (question: string) => void
  ref?: Ref<HTMLDivElement>
}) {
  const decorative = onPick === undefined
  return (
    <div
      aria-hidden={decorative || undefined}
      className="starter-ticker-copy flex shrink-0 items-start gap-2 pr-2"
      ref={ref}
    >
      {STARTER_QUESTIONS.map(question => (
        // The pool's questions are one line each, which is what lets the row
        // move at a steady speed and never reflow.
        <Suggestion
          className="max-w-none whitespace-nowrap"
          inert={decorative || undefined}
          key={question}
          onClick={onPick}
          suggestion={question}
          tabIndex={decorative ? -1 : undefined}
        />
      ))}
    </div>
  )
}

/**
 * Where the loop has got to, as a fraction, straight from the animation the
 * browser is running. Null when nothing is animating, which is a row that
 * has not started or a visitor who asked for no motion.
 */
function animationProgress(track: Element): number | null {
  const progress = track
    .getAnimations()[0]
    ?.effect?.getComputedTiming().progress
  return typeof progress === 'number' ? progress : null
}

/** The edge fade, read from the stylesheet so one number defines it. */
function fadeWidth(viewport: Element): number {
  const declared = getComputedStyle(viewport).getPropertyValue('--ticker-fade')
  return Number.parseFloat(declared) || 0
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
