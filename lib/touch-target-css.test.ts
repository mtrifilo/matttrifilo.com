import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { cssBlock } from '@/test/css-block'

/**
 * The stylesheet's half of the 44 px hit area (MTC-88). Which controls wear
 * the class is components/assistant/accessibility.test.tsx.
 */

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('.touch-target', () => {
  test('grows the hit area to 44 px each way, centred on the control', () => {
    const rule = cssBlock(declarations, '.touch-target::after {')
    expect(rule).toContain("content: '';")
    expect(rule).toContain('position: absolute;')
    expect(rule).toContain('width: max(100%, 44px);')
    expect(rule).toContain('height: max(100%, 44px);')
    expect(rule).toContain('transform: translate(-50%, -50%);')
  })

  test('never sets the control’s own position', () => {
    // An unlayered `position` outranks every Tailwind utility, so it would
    // pull the floating "Jump to latest" button back into the flow.
    expect(declarations).not.toMatch(/\.touch-target\s*\{/)
  })
})
