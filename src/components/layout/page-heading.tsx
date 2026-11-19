"use client";

/**
 * PageHeading — the title row every dashboard page starts with.
 *
 * The title is the page's sidebar name (see usePageLabel), so renaming a
 * menu item renames its page. There is deliberately no description line
 * under it. `title` overrides the menu name — use it only for pages that
 * aren't a menu item (a broadcast's own page, a flow's runs …).
 * `actions` sits on the right (buttons), wrapping under the title on
 * phones.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { usePageLabel } from "@/hooks/use-page-label";

export function PageHeading({
  title,
  fallback,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  /** Used when the page isn't in the menu and no `title` is given. */
  fallback?: string;
  actions?: ReactNode;
  className?: string;
  /** Extra content next to the title (badges etc.). */
  children?: ReactNode;
}) {
  const menuLabel = usePageLabel(fallback);
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate font-heading text-2xl font-bold tracking-tight text-foreground">
          {title ?? menuLabel}
        </h1>
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
