'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

export function ModeToggle() {
  // `theme` is 'system' by default, so comparing it would leave a
  // system-dark user stuck on the first click. `resolvedTheme` is what
  // is actually on screen.
  const { resolvedTheme, setTheme } = useTheme()

  const toggleTheme = () => {
    // Undefined until next-themes has resolved on the client; ignore a
    // click that arrives before then rather than guessing a direction.
    // The Sun/Moon icons are CSS-driven (dark: variants), so no mount
    // gate is needed to avoid an icon flash.
    if (!resolvedTheme) return
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button variant="outline" size="icon" onClick={toggleTheme}>
      <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
