"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Search, Settings, User, UserCog } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useAuth } from "@/hooks/use-auth";
import { usePageLabel } from "@/hooks/use-page-label";
import { ADMIN_SETTINGS_MODULES, PERSONAL_SETTINGS_MODULES } from "@/lib/auth/module-access";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/appointments": "appointments",
  "/notifications": "notifications",
  "/contacts": "contacts",
  "/master": "master",
  "/workspace": "workspace",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/automations": "automations",
  "/flows": "flows",
  "/access-control": "accessControl",
  "/settings": "adminSettings",
  "/account": "settings",
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
 * menu (profile, settings, sign out). On mobile it
 * collapses to hamburger + page title + bell + avatar.
 */
export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const router = useRouter();
  const titleKey = getPageTitleKey(pathname);
  // The sidebar's (possibly renamed) name for this page, like the page heading.
  const pageLabel = usePageLabel();
  const { profile, signOut, can } = useAuth();
  const personalReadable = PERSONAL_SETTINGS_MODULES.some((m) => can(m, "read"));
  const adminReadable = [...ADMIN_SETTINGS_MODULES, "deals" as const].some((m) => can(m, "read"));
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

  const name = profile?.full_name || profile?.email || t("defaultUser");
  const initials =
    (profile?.full_name ?? profile?.email ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "U";
  const itemClass = "text-popover-foreground focus:bg-accent focus:text-accent-foreground";

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
        {pageLabel ?? t(titleKey as string)}
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

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("openAccountMenu")}
          className="flex items-center gap-2.5 rounded-[10px] p-1 text-left transition-colors hover:bg-sunken focus:bg-sunken focus:outline-none data-popup-open:bg-sunken lg:border-l lg:border-border lg:pl-3"
        >
          <Avatar className="size-8 shrink-0">
            {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? t("defaultAvatar")} /> : null}
            <AvatarFallback className="bg-[#3E6FB5] text-xs font-bold text-white">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[200px] truncate text-[13.5px] font-semibold text-foreground lg:inline">
            {name}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="min-w-60 bg-popover text-popover-foreground ring-border"
        >
          {/* On mobile the chip is only an avatar, so say who is signed in here. */}
          <div className="flex flex-col gap-0.5 px-2 py-1.5 lg:hidden">
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          </div>
          <DropdownMenuSeparator className="bg-border lg:hidden" />
          {can("settings-profile", "read") ? (
            <DropdownMenuItem render={<Link href="/account?tab=profile" className={itemClass} />}>
              <User className="size-4" />
              {t("menuProfile")}
            </DropdownMenuItem>
          ) : null}
          {personalReadable ? (
            <DropdownMenuItem render={<Link href="/account" className={itemClass} />}>
              <UserCog className="size-4" />
              {t("menuSettings")}
            </DropdownMenuItem>
          ) : null}
          {adminReadable ? (
            <DropdownMenuItem render={<Link href="/settings" className={itemClass} />}>
              <Settings className="size-4" />
              {t("menuAdminSettings")}
            </DropdownMenuItem>
          ) : null}
          {personalReadable || adminReadable ? <DropdownMenuSeparator className="bg-border" /> : null}
          <DropdownMenuItem onClick={signOut} className={itemClass}>
            <LogOut className="size-4" />
            {t("menuSignOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
