"use client"

import { Collapsible as CollapsiblePrimitive } from "radix-ui"

/**
 * shadcn `collapsible`, unmodified, added with the CLI like the other
 * primitives here. It keeps the registry's formatting, so `.prettierrc` does
 * not apply to this file.
 *
 * Its only caller is components/ai-elements/chain-of-thought.tsx; see the
 * README there for why those files are vendored rather than generated.
 */

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
