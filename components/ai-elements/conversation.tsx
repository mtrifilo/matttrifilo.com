"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

/**
 * Vercel AI Elements `conversation`, trimmed to what this site uses (MTC-33).
 *
 * Two deliberate changes from the registry component:
 *
 * 1. No `role="log"`. That role carries an implicit `aria-live="polite"`, so a
 *    screen reader would re-announce the answer on every streamed token. The
 *    assistant announces its state once through the visually hidden
 *    `role="status"` region in components/assistant instead.
 * 2. The download button and its Markdown serialiser are gone. Nothing offers
 *    a transcript download: conversations are not saved anywhere.
 */

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="smooth"
    resize="smooth"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  scrollClassName,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-6", className)}
    // Without this, a flick at the bottom of the transcript carries on into
    // the page behind it and drags the footer up over the composer.
    scrollClassName={cn("overscroll-contain", scrollClassName)}
    {...props}
  />
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  children,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) return null;

  return (
    <Button
      // Opaque in both themes: the pill floats over the transcript, and the
      // Button outline variant's dark background is translucent.
      className={cn(
        "absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full",
        "bg-background dark:bg-background dark:hover:bg-muted",
        className
      )}
      onClick={handleScrollToBottom}
      size="sm"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
      {children ?? "Jump to latest"}
    </Button>
  );
};
