"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { ChevronDownIcon, DotIcon, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo } from "react";

/**
 * Vercel AI Elements `chain-of-thought` (Apache-2.0), trimmed and adapted to
 * what this site uses. Taken from the registry on 2026-09-16 for MTC-42.
 *
 * Gone from the registry component: `ChainOfThoughtSearchResults`,
 * `ChainOfThoughtSearchResult` and `ChainOfThoughtImage`. This assistant
 * reads local documents, so there are no web results to chip and no images to
 * caption; dropping them drops the `badge` primitive with them.
 *
 * Changed:
 *
 * - `ChainOfThoughtHeader` has no `BrainIcon` and no default label. The label
 *   is the caller's, because it is the one line that stays on screen after
 *   the answer arrives and it has to say something true about the run. It
 *   also takes a `timer` slot, rendered right-aligned and `aria-hidden`: the
 *   elapsed seconds change every second, and a screen reader that re-read
 *   them would drown out the steps. It is still a real `CollapsibleTrigger`,
 *   so `aria-expanded` and keyboard behaviour come from Radix.
 * - `ChainOfThoughtStep` has a fourth status, `stopped`, for the step that was
 *   in flight when a run ended without finishing. It is the state that keeps
 *   the view honest, so it is part of the component rather than a caller's
 *   className: muted, never a spinner. An `active` step spins its icon, so the
 *   caller passes a spinner icon and the component turns it.
 * - There is one `Collapsible` root, in `ChainOfThought`, rather than one
 *   around the trigger and a second around the content. Radix derives the
 *   content's id per root and stamps it on the trigger as `aria-controls`, so
 *   two roots leave the trigger pointing at an id that is not in the document
 *   and the button is never associated with the region it opens.
 * - Every animation class is paired with `motion-reduce:animate-none`.
 */

type ChainOfThoughtContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
);

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought"
    );
  }
  return context;
};

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });

    const chainOfThoughtContext = useMemo(
      () => ({ isOpen, setIsOpen }),
      [isOpen, setIsOpen]
    );

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <Collapsible onOpenChange={setIsOpen} open={isOpen}>
          <div
            className={cn("not-prose max-w-prose space-y-4", className)}
            {...props}
          >
            {children}
          </div>
        </Collapsible>
      </ChainOfThoughtContext.Provider>
    );
  }
);

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  /** Right-aligned and hidden from assistive tech. See the file header. */
  timer?: ReactNode;
};

export const ChainOfThoughtHeader = memo(
  ({ className, children, timer, ...props }: ChainOfThoughtHeaderProps) => {
    const { isOpen } = useChainOfThought();

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
          className
        )}
        {...props}
      >
        <span className="min-w-0 flex-1 truncate text-left">{children}</span>
        {timer !== undefined && (
          <span aria-hidden="true" className="shrink-0 tabular-nums">
            {timer}
          </span>
        )}
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 transition-transform",
            isOpen ? "rotate-180" : "rotate-0"
          )}
        />
      </CollapsibleTrigger>
    );
  }
);

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: "complete" | "active" | "pending" | "stopped";
};

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon = DotIcon,
    label,
    description,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => {
    const statusStyles = {
      complete: "text-muted-foreground",
      active: "text-foreground",
      pending: "text-muted-foreground/50",
      stopped: "text-muted-foreground",
    };
    const iconStyles = {
      complete: "",
      active: "animate-spin motion-reduce:animate-none",
      pending: "",
      stopped: "",
    };

    return (
      <div
        className={cn(
          "flex gap-2 text-sm",
          statusStyles[status],
          "fade-in-0 slide-in-from-top-2 animate-in motion-reduce:animate-none",
          className
        )}
        {...props}
      >
        <div className="relative mt-0.5">
          <Icon className={cn("size-4", iconStyles[status])} />
          <div className="-mx-px absolute top-7 bottom-0 left-1/2 w-px bg-border" />
        </div>
        <div className="flex-1 space-y-2 overflow-hidden">
          <div>{label}</div>
          {description && (
            <div className="text-muted-foreground text-xs">{description}</div>
          )}
          {children}
        </div>
      </div>
    );
  }
);

export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const ChainOfThoughtContent = memo(
  ({ className, ...props }: ChainOfThoughtContentProps) => (
    <CollapsibleContent
      className={cn(
        "mt-2 space-y-3",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
