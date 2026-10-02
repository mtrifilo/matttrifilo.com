import {
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'

/**
 * How the visitor is pointing, for the two decisions that depend on it:
 * where focus goes after a control asks a question for them or starts a new
 * conversation, and whether the honeycomb background waits for load and an
 * idle moment before it starts (`hasCoarsePointer`, read by
 * components/background/HexBackground.tsx).
 *
 * Focusing the composer parks the caret for the next question, which is what
 * a mouse or keyboard visitor wants. On a touch device the same call raises
 * the on-screen keyboard over the page, so an activation made by touch leaves
 * the composer alone, and so does /ask when it loads on a touch device.
 */

const COARSE_POINTER_QUERY = '(pointer: coarse)'

/**
 * Whether the device's primary pointer is a finger. False where the browser
 * cannot say: on the server, and where `matchMedia` is missing or throws.
 */
export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false
  try {
    return window.matchMedia(COARSE_POINTER_QUERY).matches
  } catch {
    return false
  }
}

/**
 * What pressed a control: a pointer's `pointerType` (`touch`, `mouse`, `pen`,
 * or whatever else a browser reports), `keyboard` for Enter or Space on the
 * focused control, or null when nothing was seen.
 */
export type Press = string | null

/**
 * Whether an activation should be treated as a touch.
 *
 * The press decides (Matt, 2026-09-23, MTC-81): a finger is a touch; a mouse,
 * a pen or a key is not, even on a device whose primary pointer is a finger,
 * because a tablet with a hardware keyboard raises no on-screen keyboard for
 * a focused field. The device's primary pointer decides only when no press
 * was seen, which is how a screen reader or voice control activates a
 * control: with a click and nothing before it.
 */
export function isTouchActivation(press: Press): boolean {
  if (press === 'touch') return true
  if (press !== null) return false
  return hasCoarsePointer()
}

export interface ActivationPress {
  /** Spread on the element that contains every control that asks. */
  pressHandlers: {
    onPointerDownCapture: (event: PointerEvent) => void
    onPointerCancelCapture: (event: PointerEvent) => void
    onKeyDownCapture: (event: KeyboardEvent) => void
    onClickCapture: (event: MouseEvent) => void
    onClick: (event: MouseEvent) => void
  }
  /** Read inside a click handler: whether that click was a touch. */
  activatedByTouch: () => boolean
}

const ACTIVATION_KEYS = new Set(['Enter', ' '])

/**
 * Remembers how the visitor last pressed inside a region, so a click handler
 * that is only handed a question can still tell a tap from a click or a key.
 *
 * The capture phase sees a press before a control's own handlers can stop
 * it. A press is forgotten once it can no longer produce a click: the
 * click's bubble, which reaches the region after the control has read it,
 * forgets it, and so does a cancelled pointer (a touch that became a scroll
 * of the ticker or the transcript). A key counts only for a click on the
 * element it was pressed on, so Enter in the composer is not taken for the
 * keyboard pick of a pill a screen reader activates later. Any other key
 * forgets the press, so a pick made with Enter after an earlier tap is not
 * taken for a touch.
 *
 * The click's own `pointerType` is not read. Browsers differ on what a click
 * that no pointer produced reports there, and the one thing that must not
 * happen, a screen reader's activation on a phone read as a mouse, is safest
 * decided by the device.
 */
export function useActivationPress(): ActivationPress {
  // Set only for a key: a key counts only for a click on the element it was
  // pressed on.
  const press = useRef<{ type: string; keyTarget?: EventTarget } | null>(null)

  const onPointerDownCapture = useCallback((event: PointerEvent) => {
    press.current = event.pointerType ? { type: event.pointerType } : null
  }, [])

  const onKeyDownCapture = useCallback((event: KeyboardEvent) => {
    press.current = ACTIVATION_KEYS.has(event.key)
      ? { type: 'keyboard', keyTarget: event.target }
      : null
  }, [])

  const onClickCapture = useCallback((event: MouseEvent) => {
    const keyTarget = press.current?.keyTarget
    if (keyTarget && keyTarget !== event.target) press.current = null
  }, [])

  const forgetPress = useCallback(() => {
    press.current = null
  }, [])

  const activatedByTouch = useCallback(
    () => isTouchActivation(press.current?.type ?? null),
    []
  )

  return useMemo(
    () => ({
      pressHandlers: {
        onPointerDownCapture,
        onPointerCancelCapture: forgetPress,
        onKeyDownCapture,
        onClickCapture,
        onClick: forgetPress,
      },
      activatedByTouch,
    }),
    [
      activatedByTouch,
      forgetPress,
      onClickCapture,
      onKeyDownCapture,
      onPointerDownCapture,
    ]
  )
}
