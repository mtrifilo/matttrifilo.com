'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type MouseEvent,
  type Ref,
} from 'react'
import { Suggestion } from '@/components/ai-elements/suggestion'
import { cn } from '@/lib/utils'
import { STARTER_QUESTIONS } from './copy'
import {
  EDGE_FADE_PROPERTY,
  loopSeconds,
  openingProgress,
  pillIndexFor,
  progressForScrollLeft,
  revealScrollLeft,
  scrollLeftForProgress,
  TICKER_ANIMATION_NAME,
  TICKER_COPIES,
  tickerRows,
  TOUCH_PAUSE_MS,
} from './ticker-geometry'

/**
 * The starter questions, drifting in two rows (MTC-39, MTC-55).
 *
 * Static pills could only ever show a handful of the questions the corpus
 * answers. Two rows show the whole pool by moving: each row renders its half
 * of the pool once as real buttons and once more as a silent copy behind it,
 * and a CSS keyframe slides the track by exactly one copy's width, so the
 * frame that ends the loop is the frame that starts it. Nothing here runs per
 * frame; the browser owns the motion, and app/globals.css owns the rules.
 *
 * Four things are worth reading twice.
 *
 * **Both rows travel right to left**, the reading direction, so a question
 * arrives first word first. A row moving the other way shows its last words
 * first, which is unreadable however slowly it goes.
 *
 * **A row opens on a whole pill.** Where a pill sits is a measurement, not a
 * constant, so the opening offset is computed from the row's own layout on
 * the first measurement and then left alone: after that the offset belongs to
 * the loop. Until that measurement the stylesheet keeps the moving rows
 * invisible, so the server's markup never shows a row at the wrong pill and
 * then jumps.
 *
 * **Tab meets each question once, and every visible pill works.** Only the
 * first copy of a row is announced and tabbable; the second is `aria-hidden`
 * with `tabIndex={-1}` buttons. It is NOT `inert`, which would make it
 * unclickable: the trailing copy is what a row shows while its loop wraps,
 * and that is most of the time the pool's first questions are on screen. A
 * dead pill under the cursor is the one thing these rows must never be, so
 * the duplicate answers a click and hands the same question over.
 *
 * **A focused pill has to be visible**, and the track's transform is what
 * makes that hard: most of a row sits at offsets no scroll position can
 * reach. So focus freezes that row's track, hands its position over to
 * `scrollLeft`, and scrolls the pill clear of the edge fades; blur converts
 * back into a progress the animation resumes from. Both conversions go
 * through ticker-geometry.ts, which is why neither switch is visible. A
 * frozen track also gains a blank lead as wide as the fade, which is the
 * only way a row's first pill, with nothing to its left, can be scrolled
 * clear of the gradient.
 */

/**
 * The pool as the two rows carry it. Computed once, because it is a property
 * of the pool rather than of any surface showing it.
 */
const ROWS = tickerRows(STARTER_QUESTIONS)

export interface StarterTickerProps {
  onPick: (question: string) => void
  /**
   * Which pill each row opens on, as an index into the row. Two surfaces show
   * the same pool in the same order, and this is what stops them showing the
   * same questions at the same moment.
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
  const groupRef = useRef<HTMLDivElement>(null)
  const resumeRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(resumeRef.current), [])

  // Pausing on touch is what keeps a moving pill from being a moving target.
  // It is not behind `pointer: coarse`, because a touchstart is itself the
  // evidence, and a touchscreen laptop reports a fine pointer. Both rows
  // stop: a row still drifting beside the one being read is the distraction
  // the pause exists to remove, which is also why hover and focus are read
  // off this element rather than off a single row.
  const handleTouchStart = useCallback(() => {
    const group = groupRef.current
    if (!group || prefersReducedMotion()) return
    group.dataset.touched = 'true'
    clearTimeout(resumeRef.current)
    resumeRef.current = setTimeout(() => {
      delete group.dataset.touched
    }, TOUCH_PAUSE_MS)
  }, [])

  return (
    <div
      aria-label={TICKER_LABEL}
      className={cn('starter-ticker flex w-full flex-col gap-2', className)}
      onTouchStart={handleTouchStart}
      ref={groupRef}
      role="group"
    >
      {ROWS.map((questions, index) => (
        <TickerRow
          key={index}
          onPick={onPick}
          questions={questions}
          startAt={startAt}
        />
      ))}
    </div>
  )
}

/**
 * One drifting row.
 *
 * Each row measures itself, because the rows hold a different number of
 * questions and therefore loop over different distances. One speed, two
 * durations, which is also what keeps the rows from ever falling into step.
 */
function TickerRow({
  questions,
  onPick,
  startAt,
}: {
  questions: readonly string[]
  onPick: (question: string) => void
  startAt: number
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  // The measured width of one copy of this row's questions. Everything the
  // focus handling computes is in these pixels, so it is read, never guessed.
  const copyWidthRef = useRef(0)
  // False until the row has been laid out once and placed on its opening
  // pill. After that the offset belongs to the loop and to the blur handler.
  const openedRef = useRef(false)
  // The blank lead the track was frozen with. The thaw has to subtract the
  // same number the freeze added, even if the fade changed in between.
  const insetRef = useRef(0)

  /**
   * One loop is one copy's width, so the duration is what holds the speed
   * steady whatever the row carries.
   *
   * A running animation keeps its elapsed time when the duration changes,
   * not its progress, so a later measurement would jump the row. Restarting
   * it at the progress it was already at is what keeps the speed a property
   * of the questions rather than of where the loop happens to be.
   *
   * A frozen track is left entirely alone, measurement included: a pill has
   * focus, the scroll offset was computed from the width as it was, and
   * changing that width underneath it would land the thaw on the wrong
   * pixels. The blur handler measures again once the row is its own.
   */
  const measure = useCallback(() => {
    const copy = copyRef.current
    const track = trackRef.current
    const viewport = viewportRef.current
    if (!copy || !track || !viewport || track.dataset.frozen === 'true') return
    const width = copy.getBoundingClientRect().width
    const seconds = loopSeconds(width)
    if (seconds === null || width === copyWidthRef.current) return
    copyWidthRef.current = width
    const offset = openedRef.current
      ? animationProgress(track)
      : openingProgress(
          pillStart(copy, startAt),
          fadeWidth(viewport),
          copyWidthRef.current
        )
    openedRef.current = true
    track.dataset.frozen = 'true'
    // Read to flush the style change, so removing it below starts a new
    // animation rather than amending the running one.
    void track.offsetWidth
    track.style.setProperty('--ticker-duration', `${seconds}s`)
    if (offset !== null) {
      track.style.setProperty('--ticker-offset', String(offset))
    }
    delete track.dataset.frozen
    track.dataset.placed = 'true'
  }, [startAt])

  // Once before the first paint, so the row appears on its opening pill and
  // a Tab in the first frames finds a width to work from; the observer then
  // catches the font arriving and the visitor zooming.
  useLayoutEffect(() => {
    const copy = copyRef.current
    if (!copy) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(copy)
    return () => observer.disconnect()
  }, [measure])

  const handleFocus = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    const track = trackRef.current
    const focused = event.target
    const pill = focused instanceof Element ? focused.closest('button') : null
    if (!viewport || !track || !pill) return

    // Under reduced motion the row is an ordinary scroll container with
    // nothing to freeze, and the browser scrolls the pill into view itself,
    // inside the fades because the row sets scroll-padding to match them.
    if (prefersReducedMotion()) return

    // Nothing is moving before the first frame, and nothing is transformed
    // either, so the row can simply be scrolled.
    const moving = track.getAnimations().length > 0
    if (moving && track.dataset.frozen !== 'true') {
      const progress = animationProgress(track)
      const copyWidth = copyWidthRef.current
      // Without both of these the transform cannot be converted, and
      // scrolling a track that is still transformed would add one offset to
      // the other. Leaving the row where it is beats moving it wrongly.
      if (progress === null || copyWidth <= 0) return
      // Freeze first: the rule that drops the animation also drops the
      // transform and adds the lead, and the scroll offset below replaces
      // both exactly.
      insetRef.current = fadeWidth(viewport)
      track.dataset.frozen = 'true'
      viewport.scrollLeft = scrollLeftForProgress(
        progress,
        copyWidth,
        insetRef.current
      )
    }

    // A pointer press focuses the pill before the click completes. Moving
    // the row now would take the pill out from under the cursor and the
    // click would be lost, and a mouse is already holding the rows still by
    // hovering them.
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

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current
      const track = trackRef.current
      if (!viewport || !track || track.dataset.frozen !== 'true') return
      // Tabbing from one pill to the next keeps the row frozen.
      const next = event.relatedTarget
      if (next instanceof Node && event.currentTarget.contains(next)) return
      const progress = progressForScrollLeft(
        viewport.scrollLeft,
        copyWidthRef.current,
        insetRef.current
      )
      viewport.scrollLeft = 0
      track.style.setProperty('--ticker-offset', String(progress))
      delete track.dataset.frozen
      // Any width the row grew while it was held still is taken now.
      measure()
    },
    [measure]
  )

  return (
    <div
      // The vertical padding is room for a focus ring the row would
      // otherwise clip; the negative margin gives it back to the layout, so
      // the two rows sit the distance apart the design says they do.
      className="edge-faded-row starter-ticker-row -my-1 w-full py-1"
      onBlur={handleBlur}
      onFocus={handleFocus}
      ref={viewportRef}
    >
      <div className="starter-ticker-track" ref={trackRef}>
        {Array.from({ length: TICKER_COPIES }, (_, index) => (
          // Only the first copy is the real one. The rest exist so the loop
          // has somewhere to come from, and the keyframe's distance is one
          // copy because there are exactly TICKER_COPIES of them.
          <QuestionRow
            decorative={index > 0}
            key={index}
            onPick={onPick}
            questions={questions}
            ref={index === 0 ? copyRef : undefined}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * One pass of a row's questions.
 *
 * `decorative` is one word for three facts that have to agree: a trailing
 * copy is not announced, not in the tab order, and not there at all under
 * reduced motion, where nothing loops. Splitting them is how a copy ends up
 * half hidden, which reads to a screen reader as the questions said twice.
 *
 * What it is not is unclickable. Every copy answers a pointer, because the
 * trailing one is what the row shows while the loop wraps.
 */
function QuestionRow({
  decorative,
  onPick,
  questions,
  ref,
}: {
  decorative: boolean
  onPick: (question: string) => void
  questions: readonly string[]
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
      {questions.map(question => (
        // The questions are one line each, which is what lets a row move at a
        // steady speed and never reflow.
        <Suggestion
          className="max-w-none whitespace-nowrap"
          key={question}
          onClick={onPick}
          // A click still asks the question; it just does not leave focus
          // parked inside an aria-hidden subtree on the way out.
          onMouseDown={decorative ? preventFocus : undefined}
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

/**
 * Where the pill a surface opens on starts, in the track's own coordinates.
 *
 * The track is the pill's offset parent, so this is the coordinate the
 * opening progress and `scrollLeft` are both measured in.
 */
function pillStart(copy: HTMLElement, startAt: number): number {
  const pills = copy.children
  const pill = pills.item(pillIndexFor(startAt, pills.length))
  return pill instanceof HTMLElement ? pill.offsetLeft : 0
}

/** The edge fade, read from the stylesheet so one number defines it. */
function fadeWidth(viewport: Element): number {
  const declared =
    getComputedStyle(viewport).getPropertyValue(EDGE_FADE_PROPERTY)
  return Number.parseFloat(declared) || 0
}

function preventFocus(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault()
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
