'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  generateHexGrid,
  renderFrame,
  HEX_COLORS,
  type HexCell,
  type HexWaveState,
} from './hex-renderer'

export function HexBackground() {
  const [mounted, setMounted] = useState(false)
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
  const themeRef = useRef<string | undefined>(undefined)

  // Keep theme ref in sync without triggering effect re-runs
  themeRef.current = resolvedTheme

  const setupCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const dpr = Math.min(window.devicePixelRatio, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    gridRef.current = generateHexGrid(width, height)
    return { width, height, ctx }
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const canvas = canvasRef.current
    if (!canvas) return

    // Check reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionQuery.matches
    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
    }
    motionQuery.addEventListener('change', onMotionChange)

    let { ctx } = setupCanvas(canvas)

    // Fire entrance wave on first mount
    if (!mountedRef.current) {
      mountedRef.current = true
      waveRef.current = {
        active: true,
        originX: window.innerWidth / 2,
        originY: window.innerHeight / 2,
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
    }
  }, [mounted, setupCanvas])

  if (!mounted) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  )
}
