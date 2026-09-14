"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

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

/**
 * Top bar from the Clinicoro reference: a 60px white strip with a wide
 * global search (Ctrl+K focuses it; Enter jumps to Contacts with the
 * query), the notifications bell with an unread dot, and the account
 * chip. On mobile it collapses to hamburger + page title + bell.
 */
export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const router = useRouter();
  const titleKey = getPageTitleKey(pathname);
  const { account, profile } = useAuth();
  const unread = useUnreadNotifications();

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/⌘+K focuses the search — the shortcut the reference advertises.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/contacts?q=${encodeURIComponent(q)}`);
  };

  const initials =
    (account?.name ?? profile?.full_name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "C";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:h-[60px] lg:gap-4 lg:px-7">
      {/* Hamburger — 44×44 hit target per Apple HIG. Mobile only. */}
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label={t("openMenu")}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-sunken hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="truncate font-heading text-base font-semibold text-foreground lg:hidden">
        {t(titleKey as string)}
      </h1>

      {/* Global search — desktop only. */}
      <form
        onSubmit={submit}
        role="search"
        className="hidden h-10 w-full max-w-[560px] items-center gap-2.5 rounded-[10px] border border-border bg-background px-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20 lg:flex"
      >
        <Search className="size-[18px] shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <kbd className="rounded-md border border-input bg-card px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          Ctrl + K
        </kbd>
      </form>

      <div className="flex-1" />

      <Link
        href="/notifications"
        aria-label={t("notifications")}
        className="relative flex size-[38px] items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-sunken hover:text-foreground"
      >
        <Bell className="size-5" strokeWidth={1.75} />
        {unread > 0 && (
          <i className="absolute top-[9px] right-[10px] size-[7px] rounded-full border-2 border-card bg-[#E0533E]" />
        )}
      </Link>

      <div
        className={cn(
          "hidden items-center gap-2.5 border-l border-border pl-3 lg:flex",
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-[#3E6FB5] text-xs font-bold text-white">
          {initials}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13.5px] font-semibold text-foreground">
            {account?.name ?? profile?.full_name ?? t("defaultUser")}
          </span>
          <span className="text-[11px] text-muted-foreground">{profile?.email ?? ""}</span>
        </span>
      </div>
    </header>
  );
}
