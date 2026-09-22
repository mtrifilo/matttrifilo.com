'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'
import { useCallback } from 'react'

/**
 * Vercel AI Elements `suggestion`, reshaped for this site (MTC-33).
 *
 * The registry version puts the pills in a horizontally scrolling ScrollArea.
 * Both callers own their own scroll box and their own edge fades, so the
 * registry's container (and its Radix dependency) buys nothing here.
 * `Suggestions` is the plain flex row that remains: the starter ticker lays
 * its copies out itself, and the follow-up row uses it with wrapping turned
 * off, because that row scrolls rather than growing a second line.
 *
 * The pill wraps and caps its width by default. The ticker overrides both,
 * because a moving row that reflowed would change speed as it went; keep the
 * defaults overridable.
 */

export type SuggestionsProps = ComponentProps<'div'>

export const Suggestions = ({ className, ...props }: SuggestionsProps) => (
  <div
    className={cn('flex flex-wrap items-start gap-2', className)}
    {...props}
  />
)

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string
  onClick?: (suggestion: string) => void
}

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = 'outline',
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion)
  }, [onClick, suggestion])

  return (
    <Button
      // The dark-mode classes repeat the light ones on purpose: the Button
      // outline variant carries its own `dark:` background and border, and a
      // `dark:`-prefixed class is not overridden by an unprefixed one.
      className={cn(
        'h-auto max-w-full rounded-lg px-4 py-3',
        'border-border bg-card dark:border-border dark:bg-card',
        'text-left text-sm font-normal whitespace-normal',
        'hover:border-primary/40 hover:bg-card hover:text-primary',
        'dark:hover:border-primary/40 dark:hover:bg-card',
        className
      )}
      onClick={handleClick}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  )
}
