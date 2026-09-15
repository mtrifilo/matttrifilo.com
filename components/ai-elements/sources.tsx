"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { FileTextIcon } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * Vercel AI Elements `sources`, reshaped for this site (MTC-33).
 *
 * The registry component hides citations behind a "Used N sources"
 * collapsible. Here the whole point of the corpus being published is that a
 * visitor can check an answer in one click, so the chips are always open and
 * always visible, and each one is a `next/link` to the document's own page on
 * this site rather than an external anchor.
 */

export type SourcesProps = ComponentProps<"ul">;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <ul
    className={cn("flex flex-wrap items-start gap-2", className)}
    {...props}
  />
);

export type SourceProps = ComponentProps<typeof Link> & {
  title: string;
};

export const Source = ({ className, title, href, ...props }: SourceProps) => (
  <li>
    <Link
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5",
        "text-sm text-foreground transition-colors hover:border-primary/40 hover:text-primary",
        className
      )}
      href={href}
      {...props}
    >
      <FileTextIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{title}</span>
    </Link>
  </li>
);
