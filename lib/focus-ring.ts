/**
 * The keyboard focus indicator for a control that draws no ring of its own
 * (MTC-88): a solid 2 px outline in the ring token, 2 px clear of the
 * control.
 *
 * Without it such a control falls back to the stylesheet's base rule, an
 * outline in the ring token at half strength, which is 1.5:1 to 2.2:1
 * against the page: under the 3:1 WCAG 1.4.11 asks of a focus indicator.
 * The ring token itself is held to 3:1 on both themes by
 * lib/theme-contrast.test.ts. `:focus-visible`, not `:focus`, so a mouse
 * click draws nothing and a keyboard always does.
 *
 * Controls built on components/ui/button.tsx already carry that component's
 * ring and border and do not need this.
 */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
