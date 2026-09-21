'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
  TICKER_ANIMATION_NAME,
  TICKER_COPIES,
  TOUCH_PAUSE_MS,
} from './ticker-geometry'

/**
 * The starter questions, drifting (MTC-39).
 *
 * Three static pills could only ever show three of the questions the corpus
 * answers. The row shows the whole pool by moving: the pool is rendered once
 * as real buttons and once more as an inert copy behind it, and a CSS
 * keyframe slides the track by exactly one copy's width, so the frame that
 * ends the loop is the frame that starts it. Nothing here runs per frame; the
 * browser owns the motion, and app/globals.css owns the rules.
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
  // Computed once. After the first paint the offset belongs to the blur
  // handler, and a re-render that wrote this value back would snap the row
  // to where it opened.
  const [openingOffset] = useState(() => offsetForStartAt(startAt))

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
      if (seconds === null || width === copyWidthRef.current) return
      copyWidthRef.current = width
      // A running animation keeps its elapsed time when the duration
      // changes, not its progress, so a later measurement (a font arriving,
      // a zoom) would jump the row. Restarting it at the progress it was
      // already at is what keeps the width a property of the pool and not of
      // where the loop happens to be. A frozen track is left alone: the pill
      // holding focus owns the position until it is given back.
      const resumeAt = animationProgress(track)
      const frozen = track.dataset.frozen === 'true'
      if (!frozen) track.dataset.frozen = 'true'
      // Read to flush the style change, so removing it below starts a new
      // animation rather than amending the running one.
      void track.offsetWidth
      track.style.setProperty('--ticker-duration', `${seconds}s`)
      if (resumeAt !== null) {
        track.style.setProperty('--ticker-offset', String(resumeAt))
      }
      if (!frozen) delete track.dataset.frozen
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

    // A pointer press focuses the pill before the click completes. Moving
    // the row now would take the pill out from under the cursor and the
    // click would be lost, and a mouse is already holding the row still by
    // hovering it.
    if (!pill.matches(':focus-visible')) return

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
      delete track.dataset.touched
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
        style={{ '--ticker-offset': openingOffset } as CSSProperties}
      >
        {Array.from({ length: TICKER_COPIES }, (_, index) => (
          // Only the first copy is the real one. The rest exist so the loop
          // has somewhere to come from, and the keyframe's distance is one
          // copy because there are exactly TICKER_COPIES of them.
          <QuestionRow
            decorative={index > 0}
            key={index}
            onPick={onPick}
            ref={index === 0 ? copyRef : undefined}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * One pass of the pool.
 *
 * `decorative` is one word for three facts that have to agree: a trailing
 * copy is not announced, not focusable, and not there at all under reduced
 * motion, where nothing loops. Splitting them is how a copy ends up half
 * hidden, which reads to a screen reader as the pool said twice.
 */
function QuestionRow({
  decorative,
  onPick,
  ref,
}: {
  decorative: boolean
  onPick: (question: string) => void
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div
      aria-hidden={decorative || undefined}
      // The trailing gap equals the gap between pills, so the seam where the
      // loop wraps is spaced like every other join in the row.
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
          onClick={decorative ? undefined : onPick}
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
  // By name, not by position: a transition added to this element later would
  // sort ahead of the animation and hand back an unrelated progress.
  const loop = track
    .getAnimations()
    .find(animation => animationNameOf(animation) === TICKER_ANIMATION_NAME)
  const progress = loop?.effect?.getComputedTiming().progress
  return typeof progress === 'number' ? progress : null
}

function animationNameOf(animation: Animation): string | undefined {
  return (animation as { animationName?: string }).animationName
}

/** The edge fade, read from the stylesheet so one number defines it. */
function fadeWidth(viewport: Element): number {
  const declared = getComputedStyle(viewport).getPropertyValue('--ticker-fade')
  return Number.parseFloat(declared) || 0
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
