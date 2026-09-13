"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/appointments": "appointments",
  "/notifications": "notifications",
  "/contacts": "contacts",
  "/master": "master",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/automations": "automations",
  "/flows": "flows",
  "/agents": "aiAgents",
  "/access-control": "accessControl",
  "/settings": "settings",
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path),
  );
  return match ? match[1] : "dashboard";
}

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

import { useTranslations } from "next-intl";

export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const titleKey = getPageTitleKey(pathname);

  // Mobile-only. On lg+ the sidebar is always visible and carries the
  // account menu, so the old desktop top bar (page title + theme
  // toggle + avatar menu) was pure chrome and has been removed; each
  // page renders its own heading. On narrow screens this bar survives
  // solely because something has to open the drawer.
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 lg:hidden">
      {/* Hamburger — 44×44 hit target per Apple HIG. */}
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label={t("openMenu")}
        className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="truncate text-base font-semibold text-foreground">
        {t(titleKey as string)}
      </h1>
    </header>
  );
}
