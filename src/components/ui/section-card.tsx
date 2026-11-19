import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * SectionCard — one block of a settings-style page (Identity, Sidebar
 * style, Page colours …) on the theme's card surface, so sections stand
 * apart from the page background the same way tables do.
 */
export function SectionCard({
  title,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs", className)}
    >
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : <span />}
          {action}
        </div>
      ) : null}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
