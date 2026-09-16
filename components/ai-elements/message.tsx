"use client";

import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import type { HTMLAttributes, ComponentProps } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";

/**
 * Vercel AI Elements `message`, trimmed to what this site uses (MTC-33).
 *
 * Gone from the registry component: the branch selector (this assistant never
 * offers alternative replies), the tooltip-wrapped action buttons (the design
 * labels Copy and Regenerate in text), and the `@streamdown/*` plugins. Those
 * plugins add maths, Mermaid, Shiki highlighting and CJK segmentation — four
 * packages for content the corpus never contains. The answers are prose and
 * bullets, which core Streamdown renders, and it still sanitises the HTML it
 * is handed.
 */

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full flex-col gap-4",
      from === "user" ? "is-user items-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/**
 * A visitor's question is a right-aligned bubble; the assistant's answer is
 * full-width with no bubble, so a long answer reads as page prose rather than
 * as a wall of chat.
 */
export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "flex min-w-0 max-w-full flex-col gap-4 text-base leading-relaxed",
      // The question is rendered as typed, not as Markdown, so its line
      // breaks are only kept if the bubble keeps them; and a pasted URL has
      // to wrap rather than run out of the bubble.
      "group-[.is-user]:w-fit group-[.is-user]:max-w-[85%] group-[.is-user]:rounded-xl",
      "group-[.is-user]:whitespace-pre-wrap group-[.is-user]:break-words",
      "group-[.is-user]:border group-[.is-user]:border-border group-[.is-user]:bg-muted",
      "group-[.is-user]:px-4 group-[.is-user]:py-3",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

/**
 * Spacing is spelled out here because the site has no typography plugin: the
 * Markdown the model emits is paragraphs and bullets, and those are the only
 * two things that need rhythm.
 */
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "space-y-4 [&_li]:my-1 [&_ol]:pl-1 [&_strong]:font-semibold [&_ul]:pl-1",
        "[&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.isAnimating === nextProps.isAnimating
);

MessageResponse.displayName = "MessageResponse";
