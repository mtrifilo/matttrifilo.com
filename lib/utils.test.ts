import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { cn } from './utils'

/**
 * Every `text-*` utility app/globals.css defines is a font size, read from
 * the stylesheet so that one added or renamed there without its entry in
 * lib/utils.ts fails here.
 */
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const fluidSizes = [...css.matchAll(/@utility (text-[\w-]+)/g)].map(
  ([, name]) => name
)

describe('cn with the text-* utilities from app/globals.css', () => {
  test('the stylesheet defines some', () => {
    expect(fluidSizes.length).toBeGreaterThan(0)
  })

  test.each(fluidSizes)(
    '%s is a font size: it keeps a color class, both ways round',
    size => {
      expect(cn('text-muted-foreground', size)).toBe(
        `text-muted-foreground ${size}`
      )
      expect(cn(size, 'text-foreground')).toBe(`${size} text-foreground`)
    }
  )

  test.each(fluidSizes)(
    '%s replaces another font size, and the later one wins',
    size => {
      expect(cn('text-xl', size)).toBe(size)
      expect(cn(size, 'text-lg')).toBe('text-lg')
    }
  )
})
