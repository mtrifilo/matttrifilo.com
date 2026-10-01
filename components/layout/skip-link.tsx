import { FOCUS_RING } from '@/lib/focus-ring'
import { cn } from '@/lib/utils'

/** The id of the one `<main>` app/layout.tsx renders around every page. */
export const MAIN_CONTENT_ID = 'main-content'

/** Matt's to change (MTC-102). */
export const SKIP_LINK_LABEL = 'Skip to content'

/**
 * First in the tab order on every page, past the nav to the page's own
 * content (WCAG 2.4.1; Matt, 2026-09-30, MTC-102). It is the first Tab stop
 * wherever focus starts at the top of the page. /ask is the exception by
 * design: where the pointer is fine it puts the caret in its composer on
 * load, so the first Tab there goes on from the composer.
 *
 * Above the top edge until it takes focus, then drawn over the nav's
 * corner, so a pointer never meets it and a keyboard always sees where it
 * is. Its target takes focus as well as scroll (`tabIndex={-1}` on the
 * `<main>`), so the next Tab continues from the content in every browser;
 * Safari does not move focus to a target that cannot hold it.
 */
export function SkipLink() {
  return (
    <a
      className={cn(
        'fixed left-4 -top-24 z-[60] focus:top-3',
        'rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm',
        FOCUS_RING
      )}
      href={`#${MAIN_CONTENT_ID}`}
    >
      {SKIP_LINK_LABEL}
    </a>
  )
}
