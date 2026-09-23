import {
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
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
    onClick: (event: MouseEvent) => void
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
 * it. A press counts only for the click it produced: the click's bubble,
 * which reaches the region after the pill has read it, forgets it, and so
 * does a key press. So a pick made with Enter after an earlier tap, or a
 * click a screen reader or voice control sends with no press at all, is not
 * taken for a touch because of a finger that landed somewhere else first.
 */
export function usePickPointer(): PickPointer {
  const pressType = useRef<string | null>(null)

  const onPointerDownCapture = useCallback((event: PointerEvent) => {
    pressType.current = event.pointerType || null
  }, [])

  const forgetPress = useCallback(() => {
    pressType.current = null
  }, [])

  const pickedByTouch = useCallback(() => isTouchPick(pressType.current), [])

  return useMemo(
    () => ({
      pressHandlers: {
        onPointerDownCapture,
        onKeyDownCapture: forgetPress,
        onClick: forgetPress,
      },
      pickedByTouch,
    }),
    [forgetPress, onPointerDownCapture, pickedByTouch]
  )
}
