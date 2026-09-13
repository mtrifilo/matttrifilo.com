'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import {
  createFrameScheduler,
  generateHexGrid,
  nextFrameMode,
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
  // Negative infinity, not 0: 0 is navigation start, which only reads as
  // "never moved" for as long as the off-canvas guard in shouldIdle happens
  // to be checked first.
  const lastMoveTime = useRef(Number.NEGATIVE_INFINITY)
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
    // dpr is returned, not re-read per frame, so the renderer always clears
    // with the same ratio that is baked into the transform above.
    return { width, height, ctx, dpr }
  }, [])

  // The canvas element renders identically on server and client, so no
  // mount gate is needed; everything window-dependent lives in this effect.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const initial = setupCanvas(canvas)
    let ctx = initial.ctx
    let dpr = initial.dpr
    const { width, height } = initial

    // Frame-rate policy: this background is mounted in the root layout, so a
    // loop that runs at 60 fps forever burns battery on every page for a
    // shimmer nobody is looking at. Three rates instead (see nextFrameMode):
    // full rate while the reader is driving something, about 4 fps once the
    // pointer settles or leaves so the shimmer keeps breathing for the many
    // readers who never move a pointer at all, and a full park only under
    // reduced motion, where every further frame would be identical.
    //
    // The slow and parked rates make the wake-up set load-bearing: anything
    // that can change a pixel has to call wake(), because neither rate is
    // self-healing the way a 60 fps loop was. The full set is
    //   - pointer move / leave      (the glow)
    //   - theme change              (the palette)
    //   - resize, DPR change        (bitmap re-created, therefore blank)
    //   - reduced-motion, veil      (what and how brightly we draw)
    //   - visibilitychange, pageshow, contextrestored
    //     (the backing store can be discarded out from under us: WebKit
    //      purges 2D bitmaps for backgrounded tabs, and a bfcache restore
    //      or a lost-then-restored context hands back a blank canvas)
    const scheduler = createFrameScheduler({
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimer: (handle) => window.clearTimeout(handle),
      now: () => performance.now(),
      drawFrame: (now, dt) => {
        if (!ctx) return 'parked'

        const isDark = themeRef.current === 'dark'
        const levels = (
          veiledRef.current ? BRIGHTNESS.veiled : BRIGHTNESS.fullBleed
        )[isDark ? 'dark' : 'light']

        renderFrame({
          ctx,
          grid: gridRef.current,
          mouse: mouseRef.current,
          time: now,
          palette: isDark
            ? HEX_RENDER_PALETTES.dark
            : HEX_RENDER_PALETTES.light,
          wave: waveRef.current,
          dt,
          reducedMotion: reducedMotionRef.current,
          levels,
          dpr,
        })

        const idle = shouldIdle({
          waveActive: waveRef.current.active,
          pointerOnCanvas: pointerOnCanvasRef.current,
          msSincePointerMove: now - lastMoveTime.current,
          reducedMotion: reducedMotionRef.current,
        })
        return nextFrameMode(idle, reducedMotionRef.current)
      },
    })

    // One named wake for every listener below to share, and a stable
    // reference so addEventListener and removeEventListener agree.
    const wake = () => scheduler.wake()

    // Check reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionQuery.matches
    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
      // Pointer tracking is suspended while reduced motion is on (below),
      // so the stored position is stale on the way out. Forget it rather
      // than painting a glow where the pointer used to be.
      pointerOnCanvasRef.current = false
      mouseRef.current = { x: -1000, y: -1000 }
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

    // Mouse tracking (throttled, no re-renders).
    //
    // Under reduced motion the shimmer, the glow and the wave are all forced
    // to zero, so no pointer position can change a pixel and waking would
    // redraw the whole grid identically. The inputs that can still change
    // such a frame (theme, viewport, the preference itself) wake directly.
    const onPointerMove = (e: PointerEvent) => {
      if (reducedMotionRef.current) return
      pointerOnCanvasRef.current = true
      wake()
      const now = performance.now()
      if (now - lastMoveTime.current < 16) return
      lastMoveTime.current = now
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    // Reset mouse when it leaves the window
    const onPointerLeave = () => {
      if (reducedMotionRef.current) return
      pointerOnCanvasRef.current = false
      mouseRef.current = { x: -1000, y: -1000 }
      // One more frame so a glow left under the departing pointer is erased.
      wake()
    }

    // A hidden tab gets no animation frames but does still run the idle
    // timer, and WebKit may purge the canvas' backing store while it is
    // away. So stop outright while hidden, and repaint on the way back
    // rather than trusting whatever is left in the bitmap.
    const onVisibilityChange = () => {
      if (document.hidden) scheduler.stop()
      else wake()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', wake)
    canvas.addEventListener('contextrestored', wake)

    // Rebuild the bitmap and grid, coalescing bursts of resize events.
    let resizeTimer: ReturnType<typeof setTimeout>
    const scheduleCanvasSetup = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const result = setupCanvas(canvas)
        ctx = result.ctx
        dpr = result.dpr
        // Re-creating the bitmap clears it, so a parked loop must redraw.
        wake()
      }, 150)
    }

    const ro = new ResizeObserver(scheduleCanvasSetup)
    // Observe the canvas itself: it is CSS-sized to the viewport, so this
    // also fires on height-only changes (devtools docking) where <html>'s
    // content height would not.
    ro.observe(canvas)

    // A device-pixel-ratio change (window dragged between a Retina and a 1x
    // display, or a browser zoom) resizes no box, so the ResizeObserver
    // never fires and the bitmap would keep its old resolution forever.
    // matchMedia has no "any resolution change" query, so watch for "no
    // longer the current ratio" and re-arm at the new one each time.
    let dprQuery: MediaQueryList | null = null
    const onDprChange = () => {
      armDprWatch()
      scheduleCanvasSetup()
    }
    function armDprWatch() {
      dprQuery?.removeEventListener('change', onDprChange)
      dprQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`
      )
      dprQuery.addEventListener('change', onDprChange)
    }
    armDprWatch()

    wakeRef.current = wake
    wake()

    return () => {
      wakeRef.current = null
      scheduler.stop()
      ro.disconnect()
      clearTimeout(resizeTimer)
      dprQuery?.removeEventListener('change', onDprChange)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', wake)
      canvas.removeEventListener('contextrestored', wake)
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
