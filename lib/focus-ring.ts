/**
 * The keyboard focus indicator for a control that draws no ring of its own
 * (MTC-88): a solid 2 px outline in the ring token, 2 px clear of the
 * control.
 *
 * Without it such a control falls back to the browser's own focus outline
 * in the ring token, whose width and style differ by browser (Safari draws
 * its own). This one is the same everywhere. The ring token is held to the
 * 3:1 WCAG 1.4.11 asks of a focus indicator, on both themes, by
 * lib/theme-contrast.test.ts. `:focus-visible`, not `:focus`, so a mouse
 * click draws nothing and a keyboard always does.
 *
 * Controls built on components/ui/button.tsx carry that component's 3 px
 * ring in the same token instead. Not both on one control: the Button sets
 * `outline-none`, which leaves an outline added on top with no style.
 */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
