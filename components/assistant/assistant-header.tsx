import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ASSISTANT_LABEL } from './copy'

/**
 * The persistent AI disclosure: a mark and one line saying what this is and
 * who it answers about. It sits above the assistant on every surface, is never
 * dismissible, and is the reason no answer below it has to introduce itself.
 */
export function AssistantHeader({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center gap-2 text-sm text-muted-foreground',
        className
      )}
    >
      <Sparkles aria-hidden="true" className="size-4 shrink-0 text-primary" />
      {ASSISTANT_LABEL}
    </p>
  )
}
