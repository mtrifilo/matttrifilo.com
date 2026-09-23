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
  sidewaysWheelPixels,
  TICKER_COPIES,
  tickerRows,
  WHEEL_GESTURE_GAP_MS,
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
 * Five things are worth reading twice.
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
 *
 * **A row a visitor reaches for is handed over to them.** A touch, or a
 * sideways wheel or trackpad gesture, freezes that row the same way focus
 * does and then hands it over for good: the row becomes a real scroll strip
 * and never moves on its own again, because a row that resumed under a
 * reader's finger would take the question they were reading away from them.
 * Only the row reached for stops; the other keeps drifting until it is
 * reached for itself.
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
  return (
    <div
      aria-label={TICKER_LABEL}
      className={cn('starter-ticker flex w-full flex-col gap-2', className)}
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
 * questions and therefore loop over different distances: one speed, two
 * durations. The rows are out of step because they carry different
 * questions of different widths, so their pill boundaries never line up
 * after the opening pill, whose leading edge both rows park at the fade.
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
  const placedRef = useRef(false)

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
   * pixels. The blur handler measures again once the row is its own. A row
   * handed over to the visitor is never measured again, and needs no
   * duration: it no longer loops.
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
    const offset = placedRef.current
      ? animationProgress(track)
      : openingProgress(
          pillStart(copy, startAt),
          fadeWidth(viewport),
          copyWidthRef.current
        )
    // The opening is computed for a row at scroll zero. Under a finger a
    // moving row is already a scroll container, and a drag that landed
    // before the page's script ran would otherwise offset the opening.
    if (!placedRef.current) viewport.scrollLeft = 0
    placedRef.current = true
    track.dataset.restarting = 'true'
    // Read to flush the style change, so removing it below starts a new
    // animation rather than amending the running one.
    void track.offsetWidth
    track.style.setProperty('--ticker-duration', `${seconds}s`)
    if (offset !== null) {
      track.style.setProperty('--ticker-offset', String(offset))
    }
    delete track.dataset.restarting
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

    // A row already frozen, because the visitor is tabbing along it or it
    // has been handed over, stays at its scroll offset and only the reveal
    // below applies. With no loop running the row can simply be scrolled.
    // A loop with no measured width cannot be converted, and scrolling a
    // track that is still transformed would add one offset to the other:
    // leaving the row where it is beats moving it wrongly.
    if (
      freezeAtLoopPosition(track, viewport, copyWidthRef.current) ===
      'unmeasured'
    ) {
      return
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
      // A handed-over row is the visitor's for the rest of the visit;
      // losing focus is not a reason to set it moving again.
      if (isHandedOver(viewport)) return
      // Tabbing from one pill to the next keeps the row frozen.
      const next = event.relatedTarget
      if (next instanceof Node && event.currentTarget.contains(next)) return
      // The lead is read while the track still has it, and read live: a
      // fade that changed width while the row was held (a rotation across
      // the breakpoint) moved the pills by the new width, not the old one.
      const progress = progressForScrollLeft(
        viewport.scrollLeft,
        copyWidthRef.current,
        leadOf(track)
      )
      viewport.scrollLeft = 0
      track.style.setProperty('--ticker-offset', String(progress))
      delete track.dataset.frozen
      // Any width the row grew while it was held still is taken now.
      measure()
    },
    [measure]
  )

  /**
   * Stops this row for good and gives it to the visitor as a scroll strip.
   *
   * The loop's position goes to scrollLeft exactly as it does for focus, so
   * the pill under a finger does not move and a tap still lands on it; the
   * stylesheet then lets the row scroll by hand. Nothing takes the row back:
   * blur leaves it frozen, nothing measures it again, and no timer exists to
   * resume it. A row whose position cannot be read yet is left moving rather
   * than moved wrongly, and the next touch or wheel tries again.
   *
   * Returns whether this call is the one that handed the row over.
   */
  const handOver = useCallback((): boolean => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track || isHandedOver(viewport)) return false
    // Under reduced motion the row is already a strip the visitor scrolls.
    if (prefersReducedMotion()) return false
    if (
      freezeAtLoopPosition(track, viewport, copyWidthRef.current) !== 'frozen'
    ) {
      return false
    }
    viewport.dataset.handedOver = 'true'
    return true
  }, [])

  /**
   * A sideways wheel or trackpad gesture over a moving row hands it over,
   * and the rest of that gesture is scrolled here rather than natively.
   *
   * The gesture began over a row that could not scroll, and browsers decide
   * which box a gesture scrolls when it begins, so after the hand-over the
   * rest of it may go to the page (or to the history swipe) instead of the
   * strip. Cancelling each of its events and moving the strip by their
   * deltas lets the first gesture read ahead whichever box the browser
   * chose, as long as its events can still be cancelled. The
   * next gesture begins over a strip that can scroll, so the browser takes
   * over and the listener, which has to be able to cancel and so is attached
   * by hand, is removed.
   */
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    // When this row last moved under the gesture that handed it over.
    let steeredAt = Number.NEGATIVE_INFINITY
    const handleWheel = (event: WheelEvent) => {
      const handedOver = isHandedOver(viewport)
      if (handedOver && event.timeStamp - steeredAt > WHEEL_GESTURE_GAP_MS) {
        viewport.removeEventListener('wheel', handleWheel)
        return
      }
      // Every event of the steered gesture keeps it alive, upright ones
      // included, so a pause in its sideways part does not hand the rest of
      // it back to a browser that may still have it latched to the page.
      if (handedOver) steeredAt = event.timeStamp
      const pixels = sidewaysWheelPixels(
        event,
        rootFontSize(),
        viewport.clientWidth
      )
      if (pixels === 0) return
      if (!handedOver && !handOver()) return
      steeredAt = event.timeStamp
      // An event the browser will not let go of is one it is scrolling
      // itself; moving the strip as well would scroll it twice.
      if (!event.cancelable) return
      event.preventDefault()
      viewport.scrollLeft += pixels
    }
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [handOver])

  return (
    <div
      // The vertical padding is room for a focus ring the row would
      // otherwise clip; the negative margin gives it back to the layout, so
      // the two rows sit the distance apart the design says they do.
      className="edge-faded-row starter-ticker-row -my-1 w-full py-1"
      onBlur={handleBlur}
      onFocus={handleFocus}
      // Not behind `pointer: coarse`: a touchstart is itself the evidence,
      // and a touchscreen laptop reports a fine pointer.
      onTouchStart={handOver}
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
 * What freezing a row came to: `frozen` is a track whose scrollLeft shows
 * what its loop showed (now, or since an earlier freeze), `not-moving` is a
 * row with no loop running and so no position to hand over, and
 * `unmeasured` is a loop with no width to convert it by, which is left
 * exactly as it was.
 */
type FreezeResult = 'frozen' | 'not-moving' | 'unmeasured'

/**
 * Stops a moving row where its loop has got to, handing the position from
 * the track's transform to the row's scrollLeft. Focus and the visitor's own
 * hand both come through here, which is why neither moves the row.
 */
function freezeAtLoopPosition(
  track: HTMLElement,
  viewport: HTMLElement,
  copyWidth: number
): FreezeResult {
  if (track.dataset.frozen === 'true') return 'frozen'
  const progress = animationProgress(track)
  if (progress === null) return 'not-moving'
  if (copyWidth <= 0) return 'unmeasured'
  // Freeze first: the rule that drops the animation also drops the
  // transform and adds the lead, and the scroll offset below replaces both
  // exactly.
  track.dataset.frozen = 'true'
  viewport.scrollLeft = scrollLeftForProgress(
    progress,
    copyWidth,
    leadOf(track)
  )
  return 'frozen'
}

/**
 * Whether the visitor has had this row handed over for the rest of the
 * visit. A handed-over row's track is always frozen too: the flag is only
 * written after a freeze, and the one path that thaws (blur) skips it.
 */
function isHandedOver(viewport: HTMLElement): boolean {
  return viewport.dataset.handedOver === 'true'
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

/**
 * The blank lead a frozen track carries, as the stylesheet actually applied
 * it. It is the fade width by declaration; reading the padding itself is
 * what keeps the freeze and the thaw converting with the pixels on screen.
 */
function leadOf(track: Element): number {
  return Number.parseFloat(getComputedStyle(track).paddingInlineStart) || 0
}

/** One line of a line-based wheel delta, as the page sets its text. */
function rootFontSize(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
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
