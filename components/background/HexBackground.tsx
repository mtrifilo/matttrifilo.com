'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import {
  generateHexGrid,
  renderFrame,
  shouldIdle,
  HEX_RENDER_PALETTES,
  BRIGHTNESS,
  VEIL_QUERY,
  type HexCell,
  type HexWaveState,
} from './hex-renderer'

export function HexBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const lastMoveTime = useRef(0)
  const pointerOnCanvasRef = useRef(false)
  const gridRef = useRef<HexCell[]>([])
  const waveRef = useRef<HexWaveState>({
    active: false,
    originX: 0,
    originY: 0,
    radius: 0,
    startTime: 0,
  })
  // Set by the animation effect; lets the other effects and listeners restart
  // a loop that has parked itself (see the idle policy below).
  const wakeRef = useRef<(() => void) | null>(null)
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
    // A parked loop would otherwise keep showing the old theme's palette.
    wakeRef.current?.()
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
      wake()
    }
    motionQuery.addEventListener('change', onMotionChange)

    // Track whether the reading column is veiled (see globals.css) so the
    // field uses the brighter range only where the mask is active.
    const veilQuery = window.matchMedia(VEIL_QUERY)
    veiledRef.current = veilQuery.matches
    const onVeilChange = (e: MediaQueryListEvent) => {
      veiledRef.current = e.matches
      wake()
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
      pointerOnCanvasRef.current = true
      wake()
      const now = performance.now()
      if (now - lastMoveTime.current < 16) return
      lastMoveTime.current = now
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    // Reset mouse when it leaves the window
    const onPointerLeave = () => {
      pointerOnCanvasRef.current = false
      mouseRef.current = { x: -1000, y: -1000 }
      // One more frame so a glow left under the departing pointer is erased.
      wake()
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
        // Resizing the bitmap clears it, so a parked loop must redraw.
        wake()
      }, 150)
    })
    // Observe the canvas itself: it is CSS-sized to the viewport, so this
    // also fires on height-only changes (devtools docking) where <html>'s
    // content height would not.
    ro.observe(canvas)

    // Animation loop.
    //
    // Idle policy: this background is mounted in the root layout, so a loop
    // that runs forever burns battery on every page for a shimmer nobody is
    // looking at. Instead the loop parks itself — no rAF scheduled, no
    // timers, idle cost genuinely zero — as soon as the frame it just drew
    // is the last one that can differ (shouldIdle). Everything that can
    // change a pixel afterwards is a discrete event, and each of those calls
    // wake(): pointer move and leave, theme change, viewport resize, and the
    // reduced-motion and veil breakpoints.
    //
    // rafId is the single source of truth for "running": 0 means parked.
    let rafId = 0
    let lastTime = performance.now()

    const loop = (now: number) => {
      rafId = 0
      if (!ctx) return
      const dt = Math.min((now - lastTime) / 1000, 0.1) // cap dt to avoid jumps
      lastTime = now

      const isDark = themeRef.current === 'dark'
      const palette = isDark
        ? HEX_RENDER_PALETTES.dark
        : HEX_RENDER_PALETTES.light
      const levels = (
        veiledRef.current ? BRIGHTNESS.veiled : BRIGHTNESS.fullBleed
      )[isDark ? 'dark' : 'light']

      renderFrame(
        ctx,
        gridRef.current,
        mouseRef.current,
        now,
        palette,
        waveRef.current,
        dt,
        reducedMotionRef.current,
        levels
      )

      const park = shouldIdle({
        waveActive: waveRef.current.active,
        pointerOnCanvas: pointerOnCanvasRef.current,
        msSincePointerMove: now - lastMoveTime.current,
        reducedMotion: reducedMotionRef.current,
      })
      if (!park) rafId = requestAnimationFrame(loop)
    }

    function wake() {
      if (rafId !== 0) return
      // Restart the clock: a parked loop may have been out for minutes, and
      // the stale timestamp would hand the next frame a huge dt.
      lastTime = performance.now()
      rafId = requestAnimationFrame(loop)
    }

    wakeRef.current = wake
    rafId = requestAnimationFrame(loop)

    return () => {
      wakeRef.current = null
      cancelAnimationFrame(rafId)
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
