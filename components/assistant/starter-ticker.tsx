'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type Ref,
} from 'react'
import { Suggestion } from '@/components/ai-elements/suggestion'
import { cn } from '@/lib/utils'
import {
  seeAllQuestionsLabel,
  SHOW_FEWER_LABEL,
  STARTER_QUESTIONS,
} from './copy'
import { StarterQuestionList } from './starter-question-list'
import {
  EDGE_FADE_PROPERTY,
  followPosition,
  loopSeconds,
  openingProgress,
  pillIndexFor,
  progressForScrollLeft,
  revealScrollLeft,
  scrollLeftForProgress,
  SHARED_CUT_PROPERTY,
  SHARED_WIDTH_PROPERTY,
  sharedWindow,
  type StripPlacement,
  TICKER_ANIMATION_NAME,
  sidewaysWheelPixels,
  TICKER_COPIES,
  tickerRows,
  WHEEL_GESTURE_GAP_MS,
  widestPlacement,
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
 * Six things are worth reading twice.
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
 * **Rows a visitor reaches for are handed over to them, both at once.** A
 * touch, or a sideways wheel or trackpad gesture, on either row freezes
 * each row the same way focus does, at the point its own loop had reached,
 * and then hands both over for good: they become real scroll strips and
 * never move on their own again, because a row that resumed under a
 * reader's finger would take the question they were reading away from
 * them. From then on the two strips share one scroll position, so a drag on
 * either moves both the same distance and a reader never has to scroll one
 * row to catch up with the other. The rows stopped at different points of
 * their loops, so each is trimmed to the window both can scroll through,
 * after which one scrollLeft is the position of both and the browser's own
 * edge is where both stop.
 *
 * **The whole pool can be opened as a list** (MTC-85), for a visitor who
 * would rather read every question than wait for the one they want. The
 * list takes the rows' place inside the same named group, and the rows stop
 * while it is open: hidden, so the browser drops their animation. Closing
 * it puts each row back as it was, a moving row at the point its loop had
 * reached and a handed-over pair at the position the visitor left them,
 * because hiding a box loses its scroll position and a restarted animation
 * would otherwise open at the wrong pill.
 */

/**
 * The pool as the two rows carry it. Computed once, because it is a property
 * of the pool rather than of any surface showing it.
 */
const ROWS = tickerRows(STARTER_QUESTIONS)

export interface StarterTickerProps {
  onPick: (question: string) => void
  /**
   * Which pill each row opens on, as an index into the row. Each surface
   * passes its own, from ticker-geometry.ts, so where a surface opens is
   * decided there rather than here; left out, a row opens on its first pill.
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
  // One per ticker, for its whole life: both rows' handlers must reach
  // the same window, and a new one would forget how the rows are trimmed.
  const [sharedScroll] = useState(createSharedScroll)
  const [listOpen, setListOpen] = useState(false)
  // What puts the rows back as they were, from the click that opens the
  // list until the commit that shows the rows again.
  const unparkRef = useRef<(() => void) | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const groupId = useId()

  const toggleList = useCallback(() => {
    // Read while the rows are still laid out: hidden, a row has no
    // animation to ask where it was and no scroll position to keep.
    if (!listOpen) unparkRef.current = sharedScroll.park()
    setListOpen(!listOpen)
  }, [listOpen, sharedScroll])

  // Before the paint that shows the rows again, so they never appear for a
  // frame at scroll zero or at the start of their loop.
  useLayoutEffect(() => {
    if (listOpen) return
    const unpark = unparkRef.current
    if (!unpark) return
    unparkRef.current = null
    unpark()
    // The list collapsing takes the control up the page with it. Where the
    // browser does not anchor the scroll position, the control holding
    // focus would be left above the screen.
    toggleRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [listOpen])

  return (
    <div className={cn('flex w-full flex-col gap-6', className)}>
      {/* First in the tab order, drawn under the questions (order-last) as
          the approved frames place it. A keyboard or screen-reader visitor
          reaches it before the pills, so the list is one key away rather
          than one pill after the whole pool, and after it opens the next
          Tab lands on the first question of the first theme. */}
      <button
        aria-controls={groupId}
        aria-expanded={listOpen}
        className="order-last self-start rounded-sm py-1.5 text-[13px] leading-[1.3] font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={toggleList}
        ref={toggleRef}
        type="button"
      >
        {listOpen
          ? SHOW_FEWER_LABEL
          : seeAllQuestionsLabel(STARTER_QUESTIONS.length)}
      </button>
      <div
        aria-label={TICKER_LABEL}
        className="starter-ticker flex w-full flex-col gap-2"
        id={groupId}
        role="group"
      >
        {/* Hidden rather than unmounted: the rows keep their hand-over,
            their trim and their registration while the list is open. */}
        <div className="flex w-full flex-col gap-2" hidden={listOpen}>
          {ROWS.map((questions, index) => (
            <TickerRow
              key={index}
              onPick={onPick}
              questions={questions}
              sharedScroll={sharedScroll}
              startAt={startAt}
            />
          ))}
        </div>
        {listOpen && <StarterQuestionList onPick={onPick} />}
      </div>
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
  sharedScroll,
  startAt,
}: {
  questions: readonly string[]
  onPick: (question: string) => void
  sharedScroll: SharedScroll
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
    // before the page's script ran would otherwise offset the opening. A
    // static strip has no opening, and where its visitor scrolled it stays.
    if (!placedRef.current && !prefersReducedMotion()) viewport.scrollLeft = 0
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

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
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

      // A handed-over row is revealed through the window the rows share,
      // which takes the other row the same distance.
      if (sharedScroll.reveal(viewport, pill)) return

      viewport.scrollLeft = revealScrollLeft({
        scrollLeft: viewport.scrollLeft,
        viewportWidth: viewport.clientWidth,
        // The track is the pill's offset parent, so this is already the
        // coordinate scrollLeft is measured in.
        pillStart: pill.offsetLeft,
        pillWidth: pill.offsetWidth,
        fade: fadeWidth(viewport),
        maxScrollLeft: maxScrollLeftOf(viewport),
      })
    },
    [sharedScroll]
  )

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
   * Only the shared scroll calls it, for every row at once, whichever row
   * was reached for; a handler that called it directly would hand one row
   * over and leave the other moving.
   *
   * The loop's position goes to scrollLeft exactly as it does for focus, so
   * the pill under a finger does not move and a tap still lands on it; the
   * stylesheet then lets the row scroll by hand. Nothing takes the row back:
   * blur leaves it frozen, nothing measures it again, and no timer exists to
   * resume it. A row whose position cannot be read yet is left moving rather
   * than moved wrongly, and the next touch or wheel on either row tries
   * again.
   *
   * Returns whether this call is the one that handed the row over.
   */
  const handOverThisRow = useCallback((): boolean => {
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

  // In the same commit that places the row, so a touch that lands as soon
  // as the row is visible finds it registered.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return
    return sharedScroll.add({
      viewport,
      track,
      copyWidth: () => copyWidthRef.current,
      handOverThisRow,
    })
  }, [sharedScroll, handOverThisRow])

  // A drag, its momentum, or a native wheel scroll on a handed-over row
  // moves the other row with it.
  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current
    if (viewport) sharedScroll.syncFrom(viewport)
  }, [sharedScroll])

  const handleTouchStart = useCallback(() => {
    const viewport = viewportRef.current
    sharedScroll.handOverAll()
    if (viewport) sharedScroll.touchStarted(viewport)
  }, [sharedScroll])

  const handleTouchEnd = useCallback(() => {
    const viewport = viewportRef.current
    if (viewport) sharedScroll.touchEnded(viewport)
  }, [sharedScroll])

  /**
   * A sideways wheel or trackpad gesture over a moving row hands both rows
   * over, and the rest of that gesture is scrolled here rather than
   * natively, both rows together.
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
      if (!handedOver) {
        sharedScroll.handOverAll()
        // This row may be the one that could not be handed over yet; its
        // track is still transformed, and scrolling it would add to that.
        if (!isHandedOver(viewport)) return
      }
      steeredAt = event.timeStamp
      // An event that cannot be cancelled may be one the browser is
      // scrolling itself; moving the strip as well could scroll it twice.
      // The row is handed over either way, and the next gesture scrolls it.
      if (!event.cancelable) return
      event.preventDefault()
      viewport.scrollLeft += pixels
      sharedScroll.syncFrom(viewport)
    }
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [sharedScroll])

  return (
    <div
      // The vertical padding is room for a focus ring the row would
      // otherwise clip; the negative margin gives it back to the layout, so
      // the two rows sit the distance apart the design says they do.
      className="edge-faded-row starter-ticker-row -my-1 w-full py-1"
      onBlur={handleBlur}
      onFocus={handleFocus}
      onScroll={handleScroll}
      // Not behind `pointer: coarse`: a touchstart is itself the evidence,
      // and a touchscreen laptop reports a fine pointer.
      onTouchCancel={handleTouchEnd}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
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

/** A row as the shared window sees it. */
interface SharedRow {
  /** The box that scrolls. */
  viewport: HTMLElement
  /** What the window trims, through the custom properties it sets. */
  track: HTMLElement
  /** One copy's width as the row last measured it: its period. */
  copyWidth: () => number
  /** Hands this row alone over; true when this call is the one that did. */
  handOverThisRow: () => boolean
}

/**
 * The one scroll position the rows share once the visitor has them.
 *
 * Each row stays its own scroll box, with its own fades, lead and focus
 * handling, because a touch browser picks the box a drag scrolls when the
 * finger lands: the row under the finger has to be the box that scrolls,
 * from before the hand-over to after it.
 *
 * The rows freeze at different points of their loops, so each is trimmed
 * (its start cut away, its end clipped) to the window both can scroll
 * through, with sharedWindow in ticker-geometry.ts. Trimmed, both rows
 * have the same range and one scrollLeft is the position of both: a drag
 * on either is copied to the other, and the browser stops the dragged row
 * at the shared end itself, so nothing holds it back by writing to it.
 *
 * A finger resting on one row wins over the other row's momentum: on iOS
 * a touch stops only the scroller it lands on, so a row still coasting
 * from an earlier flick would otherwise carry the touched row, and the
 * question under the finger, along with it.
 */
interface SharedScroll {
  /** Adds a row; returns what removes it again. */
  add(row: SharedRow): () => void
  /**
   * Hands every row over at once and trims them to the window they share.
   * A row that cannot be handed over yet is left moving, and joins the
   * window when a later touch or wheel on either row hands it over.
   */
  handOverAll(): void
  /**
   * Copies a handed-over row's scroll to the other rows, unless a finger
   * rests on another row, in which case this row is held to that one.
   */
  syncFrom(viewport: HTMLElement): void
  /** A finger has landed on this row. */
  touchStarted(viewport: HTMLElement): void
  /** The finger on this row has lifted, or the browser took the touch. */
  touchEnded(viewport: HTMLElement): void
  /**
   * Brings a focused pill in a handed-over row into view and takes the
   * other rows the same distance, trimming them again around where they
   * end up. False, doing nothing, when the row is not handed over.
   */
  reveal(viewport: HTMLElement, pill: HTMLElement): boolean
  /**
   * Stops every row where it is, just before the rows are hidden, and
   * returns what puts each back as it was once they are shown again. Only
   * the "see all" list calls it, while the rows are still laid out.
   */
  park(): () => void
}

/** A handed-over row, with its trim and the width it had untrimmed. */
interface Member {
  row: SharedRow
  cut: number
  naturalScrollWidth: number
}

function createSharedScroll(): SharedScroll {
  const rows = new Set<SharedRow>()
  // Handed-over rows, by their box. A row stays a member when its effect
  // runs again: it is still handed over, so no later hand-over would bring
  // it back in.
  const members = new Map<HTMLElement, Member>()
  // Where each handed-over row was last left, as the browser read it back.
  // The scroll event a write here causes finds the row still there and is
  // ignored, which is what stops two rows answering each other's events.
  const settled = new Map<HTMLElement, number>()
  // The row a finger rests on, if any.
  let touched: HTMLElement | null = null

  /** A member as the window arithmetic sees it, at an untrimmed position. */
  function placementOf(member: Member, position: number): StripPlacement {
    const { viewport, copyWidth } = member.row
    return {
      position,
      period: copyWidth(),
      maxScrollLeft: member.naturalScrollWidth - viewport.clientWidth,
    }
  }

  function untrimmedPosition(member: Member): number {
    return member.row.viewport.scrollLeft + member.cut
  }

  function settle(viewport: HTMLElement, scrollLeft: number): void {
    // Written only when it changes, so a row already in place gets no
    // scroll event to answer.
    if (viewport.scrollLeft !== scrollLeft) viewport.scrollLeft = scrollLeft
    settled.set(viewport, viewport.scrollLeft)
  }

  /**
   * Trims every member to the window their untrimmed positions share and
   * scrolls them all to it. A row's cut and its scrollLeft change by the
   * same amount in the same task, so a row trimmed where it already is does
   * not move on screen; a row given a new position (a reveal) moves there.
   */
  function trimTo(placed: readonly (readonly [Member, number])[]): void {
    const window = sharedWindow(
      placed.map(([member, position]) => placementOf(member, position))
    )
    placed.forEach(([member], index) => {
      const { viewport, track } = member.row
      member.cut = window.cuts[index]
      track.style.setProperty(SHARED_CUT_PROPERTY, `${member.cut}px`)
      // The track's end, measured from the cut start, lands where the
      // shared window ends plus one viewport, which is what makes the
      // window's end the furthest this box scrolls.
      track.style.setProperty(
        SHARED_WIDTH_PROPERTY,
        `${window.maxScrollLeft + viewport.clientWidth + member.cut}px`
      )
    })
    for (const [member] of placed) {
      settle(member.row.viewport, window.scrollLeft)
    }
  }

  return {
    add(row) {
      rows.add(row)
      return () => {
        rows.delete(row)
      }
    },

    handOverAll() {
      // Read before anything is handed over or trimmed.
      const pinned = [...members.values()].map(
        member => [member, untrimmedPosition(member)] as const
      )
      const joining: Member[] = []
      for (const row of rows) {
        if (members.has(row.viewport) || !row.handOverThisRow()) continue
        joining.push({
          row,
          cut: 0,
          // Untrimmed: the row was only just handed over.
          naturalScrollWidth: row.viewport.scrollWidth,
        })
      }
      if (joining.length === 0) return
      const candidates = [
        ...pinned.map(([member, position]) => ({ member, position })),
        ...joining.map(member => ({
          member,
          position: member.row.viewport.scrollLeft,
        })),
      ]
      const positions = widestPlacement(
        candidates.map(({ member, position }) => ({
          ...placementOf(member, position),
          // A row holding focus keeps its pills where they are: moved a
          // copy on, the focused one would be off screen.
          canMove:
            joining.includes(member) &&
            !member.row.viewport.contains(document.activeElement),
        }))
      )
      for (const member of joining) members.set(member.row.viewport, member)
      trimTo(candidates.map(({ member }, index) => [member, positions[index]]))
    },

    syncFrom(source) {
      if (!members.has(source)) return
      const scrollLeft = source.scrollLeft
      if (scrollLeft === settled.get(source)) return
      if (touched && touched !== source && members.has(touched)) {
        settle(source, touched.scrollLeft)
        return
      }
      settled.set(source, scrollLeft)
      for (const viewport of members.keys()) {
        if (viewport !== source) settle(viewport, scrollLeft)
      }
    },

    touchStarted(viewport) {
      touched = viewport
    },

    touchEnded(viewport) {
      if (touched === viewport) touched = null
    },

    reveal(viewport, pill) {
      const focused = members.get(viewport)
      if (!focused) return false
      const from = untrimmedPosition(focused)
      const target = revealScrollLeft({
        scrollLeft: from,
        viewportWidth: viewport.clientWidth,
        // The track is the pill's offset parent, so this is the untrimmed
        // coordinate the row's position is measured in.
        pillStart: pill.offsetLeft,
        pillWidth: pill.offsetWidth,
        fade: fadeWidth(viewport),
        maxScrollLeft: placementOf(focused, from).maxScrollLeft,
      })
      // What moves on screen: the focused pill may sit a whole copy away
      // from the copy the row was showing, and a copy of the focused row is
      // not a copy of the other, so the other follows only what is seen.
      const delta = nearestToZero(target - from, focused.row.copyWidth())
      const placed = [...members.values()].map(member => {
        if (member === focused) return [member, target] as const
        const strip = placementOf(member, untrimmedPosition(member))
        return [member, followPosition(strip, delta)] as const
      })
      trimTo(placed)
      return true
    },

    park() {
      // A finger on a row that is about to be hidden never lifts from it.
      touched = null
      const unparks = [...rows].map(parkRow)
      return () => {
        for (const unpark of unparks) unpark()
      }
    },
  }

  /**
   * Hiding a row drops its animation and its scroll position, so what it
   * showed is kept in the one form that survives: a moving row's progress
   * becomes the offset its animation restarts from when it is shown again,
   * and any other row (handed over, held still for focus, or a static strip
   * under reduced motion) keeps its scrollLeft to be given back.
   */
  function parkRow(row: SharedRow): () => void {
    const { viewport, track } = row
    const scrollLeft = viewport.scrollLeft
    // Through settle, so the scroll event the write causes is taken for
    // the echo it is and carries nothing to the other row.
    if (members.has(viewport)) return () => settle(viewport, scrollLeft)
    const progress = animationProgress(track)
    if (progress === null) {
      return () => {
        viewport.scrollLeft = scrollLeft
      }
    }
    track.style.setProperty('--ticker-offset', String(progress))
    return () => {}
  }
}

/** Of `distance` and `distance` a whole period either way, the shortest. */
function nearestToZero(distance: number, period: number): number {
  if (period <= 0) return distance
  return [distance, distance - period, distance + period].reduce(
    (nearest, candidate) =>
      Math.abs(candidate) < Math.abs(nearest) ? candidate : nearest
  )
}

/** The furthest a row can scroll, as its own layout allows. */
function maxScrollLeftOf(viewport: HTMLElement): number {
  return Math.max(viewport.scrollWidth - viewport.clientWidth, 0)
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
