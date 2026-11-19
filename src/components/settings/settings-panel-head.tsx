'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { usePageLabel } from '@/hooks/use-page-label';

/**
 * Set by pages whose whole content is one panel (Master → Branches,
 * Workspace → Branding …). Inside it, the panel's head *is* the page
 * title: it shows the page's sidebar name, sized as the page heading.
 */
const PrimaryPanelContext = createContext(false);

export function PrimaryPanel({ children }: { children: ReactNode }) {
  return <PrimaryPanelContext.Provider value>{children}</PrimaryPanelContext.Provider>;
}

/**
 * Header at the top of every settings / master panel — a title and an
 * optional right-aligned action (e.g. "New template", "Invite member").
 *
 * `description` is accepted for old call sites but no longer shown: the
 * product drops the explanatory line under titles. In a PrimaryPanel the
 * title is the sidebar name (renaming the menu item renames the page);
 * elsewhere (Settings tabs) it is the `title` given.
 */
export function SettingsPanelHead({
  title,
  action,
  className,
}: {
  title: string;
  /** @deprecated Not rendered; kept so existing call sites compile. */
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const primary = useContext(PrimaryPanelContext);
  const menuLabel = usePageLabel(title);
  return (
    <div
      className={cn(
        'mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {primary ? (
          <h1 className="truncate font-heading text-2xl font-bold tracking-tight text-foreground">
            {menuLabel}
          </h1>
        ) : (
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        )}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
