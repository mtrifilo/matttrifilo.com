'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import {
  generateHexGrid,
  renderFrame,
  HEX_COLORS,
  BRIGHTNESS,
  type HexCell,
  type HexWaveState,
} from './hex-renderer'

// Must match the media query on `.hex-canvas` in globals.css: the width at
// which the reading column has ~4rem of real gutter on each side, so the
// mask (and the brighter field) only engage where gutters exist.
const VEIL_QUERY = '(min-width: 56rem)'

export function HexBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const lastMoveTime = useRef(0)
  const gridRef = useRef<HexCell[]>([])
  const waveRef = useRef<HexWaveState>({
    active: false,
    originX: 0,
    originY: 0,
    radius: 0,
    startTime: 0,
  })
  const rafId = useRef(0)
  const mountedRef = useRef(false)
  const reducedMotionRef = useRef(false)
  const veiledRef = useRef(false)
  const themeRef = useRef<string | undefined>(undefined)

  // Keep the theme in a ref so the animation effect below does not have
  // to re-run (and restart the entrance wave) on every theme change.
  // Refs must not be written during render: under concurrent rendering a
  // render can be discarded or replayed, which would leave the ref
  // pointing at a commit that never happened. Writing in an effect ties
  // it to a committed render.
  useEffect(() => {
    themeRef.current = resolvedTheme
  }, [resolvedTheme])

  // The canvas box is sized by CSS (fixed inset-0, w-full h-full) so it
  // always equals the viewport, even mid-resize and regardless of scrollbar
  // width; only the bitmap and the grid are (debounced) recomputed here.
  // Sizing the box from window.innerWidth would leave the mask's 50%
  // detached from the content column during a drag and offset by half a
  // classic scrollbar.
  const setupCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const dpr = Math.min(window.devicePixelRatio, 2)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    gridRef.current = generateHexGrid(width, height)
    return { width, height, ctx }
  }, [])

  // The canvas element renders identically on server and client, so no
  // mount gate is needed; everything window-dependent lives in this effect.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Check reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionQuery.matches
    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
    }
    motionQuery.addEventListener('change', onMotionChange)

    // Track whether the reading column is veiled (see globals.css) so the
    // field uses the brighter range only where the mask is active.
    const veilQuery = window.matchMedia(VEIL_QUERY)
    veiledRef.current = veilQuery.matches
    const onVeilChange = (e: MediaQueryListEvent) => {
      veiledRef.current = e.matches
    }
    veilQuery.addEventListener('change', onVeilChange)

    const initial = setupCanvas(canvas)
    let ctx = initial.ctx
    const { width, height } = initial

    // Fire entrance wave on first mount
    if (!mountedRef.current) {
      mountedRef.current = true
      waveRef.current = {
        active: true,
        originX: width / 2,
        originY: height / 2,
        radius: 0,
        startTime: performance.now(),
      }
    }

    // Mouse tracking (throttled, no re-renders)
    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now()
      if (now - lastMoveTime.current < 16) return
      lastMoveTime.current = now
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    // Reset mouse when it leaves the window
    const onPointerLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)

    // Resize handling
    let resizeTimer: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (!canvas) return
        const result = setupCanvas(canvas)
        ctx = result.ctx
      }, 150)
    })
    ro.observe(document.documentElement)

    // Animation loop
    let lastTime = performance.now()
    const loop = (now: number) => {
      if (!ctx) return
      const dt = Math.min((now - lastTime) / 1000, 0.1) // cap dt to avoid jumps
      lastTime = now

      const isDark = themeRef.current === 'dark'
      const palette = isDark ? HEX_COLORS.dark : HEX_COLORS.light
      const levels = (veiledRef.current ? BRIGHTNESS.veiled : BRIGHTNESS.fullBleed)[isDark ? 'dark' : 'light']

      renderFrame(
        ctx,
        gridRef.current,
        mouseRef.current,
        now,
        palette,
        waveRef.current,
        dt,
        reducedMotionRef.current,
        isDark,
        levels,
      )

      rafId.current = requestAnimationFrame(loop)
    }

    rafId.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId.current)
      ro.disconnect()
      clearTimeout(resizeTimer)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      motionQuery.removeEventListener('change', onMotionChange)
      veilQuery.removeEventListener('change', onVeilChange)
    }
  }, [setupCanvas])

  return (
    <canvas
      ref={canvasRef}
      className="hex-canvas fixed inset-0 z-0 h-full w-full pointer-events-none"
      aria-hidden="true"
    />
  )
}
