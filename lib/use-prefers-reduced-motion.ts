import { useSyncExternalStore } from 'react'

/**
 * Whether the visitor has asked for less motion, kept current as the
 * setting changes (MTC-88).
 *
 * For motion a script drives, which a stylesheet's `prefers-reduced-motion`
 * query cannot reach: the transcript's animated scroll to its newest line,
 * for one. False on the server and wherever `matchMedia` is missing, so the
 * first render matches the server's and a browser that cannot say gets the
 * default motion.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, onServer)
}

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => {}
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false
  return window.matchMedia(QUERY).matches
}

function onServer(): boolean {
  return false
}
