import {
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

/**
 * How the visitor is pointing, for the one decision that depends on it:
 * where focus goes after a question is asked for them.
 *
 * Focusing the composer parks the caret for a follow-up, which is what a
 * mouse or keyboard visitor wants. On a touch device the same call raises the
 * on-screen keyboard over the answer that is about to stream in, so a pick
 * made by touch leaves the composer alone, and so does /ask when it loads on
 * a touch device.
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
 * Whether a pick should be treated as a touch.
 *
 * The device's primary pointer decides first. The press that led to the pick
 * is the fallback, because a touchscreen laptop reports a fine pointer and
 * still raises an on-screen keyboard for a tapped field.
 *
 * @param pressType The `pointerType` of the last press before the pick, or
 *   null when the pick came from the keyboard or no press was seen.
 */
export function isTouchPick(pressType: string | null): boolean {
  return hasCoarsePointer() || pressType === 'touch'
}

export interface PickPointer {
  /** Spread on the element that contains every pickable question. */
  pressHandlers: {
    onPointerDownCapture: (event: PointerEvent) => void
    onKeyDownCapture: (event: KeyboardEvent) => void
  }
  /** Read inside a pick handler: whether that pick was a touch. */
  pickedByTouch: () => boolean
}

/**
 * Remembers how the visitor last pressed inside a region, so a pick handler
 * that is only handed the question can still tell a tap from a click or a
 * key.
 *
 * The capture phase sees the press before the pill's own handlers can stop
 * it. A key press clears what a pointer left behind, so a question picked
 * with Enter after an earlier tap is not taken for a touch.
 */
export function usePickPointer(): PickPointer {
  const pressType = useRef<string | null>(null)

  const onPointerDownCapture = useCallback((event: PointerEvent) => {
    pressType.current = event.pointerType || null
  }, [])

  const onKeyDownCapture = useCallback(() => {
    pressType.current = null
  }, [])

  const pickedByTouch = useCallback(() => isTouchPick(pressType.current), [])

  return useMemo(
    () => ({
      pressHandlers: { onPointerDownCapture, onKeyDownCapture },
      pickedByTouch,
    }),
    [onKeyDownCapture, onPointerDownCapture, pickedByTouch]
  )
}
