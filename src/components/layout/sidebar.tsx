"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  Bell,
  BadgeCheck,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  Coins,
  Crown,
  Database,
  FileText,
  MapPin,
  GitBranch,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Radio,
  Settings,
  ClipboardList,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Tags,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";
import type { ModuleId } from "@/lib/auth/module-access";
import { Logo } from "@/components/brand/logo";
import { useAiStatus } from "@/hooks/use-ai-status";
import { Sparkles } from "lucide-react";

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: "roleOwner",
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className: "border-transparent bg-warn-bg text-warn-fg",
  },
  admin: {
    icon: Shield,
    labelKey: "roleAdmin",
    // Primary-tinted: significant but not as scarce as owner.
    className: "border-transparent bg-info-bg text-info-fg",
  },
  agent: {
    icon: UserCog,
    labelKey: "roleAgent",
    // Neutral slate: the operational default.
    className: "border-transparent bg-neutral-bg text-neutral-fg",
  },
  viewer: {
    icon: User,
    labelKey: "roleViewer",
    // Muted slate: read-only role; visually quieter than agent.
    className: "border-transparent bg-neutral-bg text-neutral-fg/80",
  },
};
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
  /**
   * Module this row belongs to for Access control. Rows without one
   * (dashboard, settings) are always shown.
   */
  module?: ModuleId;
  /** Only render for roles that can manage members (admin+). */
  adminOnly?: boolean;
}

/**
 * A collapsible parent row with its own sub-items. It has no route of
 * its own — clicking it only toggles the children — so it never reads
 * as "active"; the active child does, and the group auto-expands to
 * reveal it (see `openGroups` below). A group whose children are all
 * hidden by access control disappears entirely.
 */
interface NavGroup {
  id: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  children: NavItem[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare, module: "inbox" },
  { href: "/appointments", labelKey: "appointments", icon: CalendarDays, module: "appointments" },
  { href: "/notifications", labelKey: "notifications", icon: Bell, module: "notifications" },
];

const navGroups: NavGroup[] = [
  // Master data — the records everything else refers to.
  {
    id: "master",
    labelKey: "master",
    icon: Database,
    children: [
      { href: "/master/clinics", labelKey: "clinics", icon: Building2, module: "clinics" },
      { href: "/master/branches", labelKey: "branches", icon: MapPin, module: "branches" },
      { href: "/master/clinic-admins", labelKey: "clinicAdmins", icon: ShieldCheck, module: "clinic-admins" },
      { href: "/master/doctors", labelKey: "doctors", icon: Stethoscope, module: "doctors" },
      { href: "/master/services", labelKey: "services", icon: ClipboardList, module: "services" },
      { href: "/master/designations", labelKey: "designations", icon: BadgeCheck, module: "designations" },
      { href: "/master/users", labelKey: "users", icon: UsersRound, module: "users" },
      { href: "/contacts", labelKey: "contacts", icon: Users, module: "contacts" },
    ],
  },
  // Everything that *configures* how the account behaves — the
  // reference panels that used to live under Settings → Workspace
  // (still served from /master/<section>) plus the engines.
  {
    id: "controls",
    labelKey: "controls",
    icon: SlidersHorizontal,
    children: [
      { href: "/pipelines", labelKey: "pipelines", icon: GitBranch, module: "pipelines" },
      { href: "/broadcasts", labelKey: "broadcasts", icon: Radio, module: "broadcasts" },
      { href: "/automations", labelKey: "automations", icon: Zap, module: "automations" },
      { href: "/flows", labelKey: "flows", icon: Workflow, beta: true, module: "flows" },
      { href: "/agents", labelKey: "aiAgents", icon: Bot, module: "agents" },
      { href: "/master/templates", labelKey: "templates", icon: FileText, module: "templates" },
      { href: "/master/quick-replies", labelKey: "quickReplies", icon: Zap, module: "quick-replies" },
      { href: "/master/fields", labelKey: "fields", icon: Tags, module: "fields" },
      { href: "/master/deals", labelKey: "deals", icon: Coins, module: "deals" },
    ],
  },
];

// Rendered after the collapsible groups, before the divider.
const afterGroupItems: NavItem[] = [
  { href: "/access-control", labelKey: "accessControl", icon: LockKeyhole, adminOnly: true },
];

const bottomNavItems = [
  { href: "/settings", labelKey: "settings", icon: Settings },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

import { useTranslations } from "next-intl";

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const {
    profile,
    profileLoading,
    account,
    accountRole,
    signOut,
    sidebarModules,
    canManageMembers,
  } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const ai = useAiStatus();

  const isItemActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href));

  // Visibility and order both come from the member's permissions: a
  // module shows only with `view`, and rows follow the order the
  // designation was arranged in (Access control). Rows without a
  // module (dashboard, settings) are fixed.
  const isItemVisible = (item: NavItem) =>
    (!item.module || sidebarModules.includes(item.module)) &&
    (!item.adminOnly || canManageMembers);
  const byPermissionOrder = (a: NavItem, b: NavItem) => {
    const ia = a.module ? sidebarModules.indexOf(a.module) : -1;
    const ib = b.module ? sidebarModules.indexOf(b.module) : -1;
    return ia - ib;
  };
  const orderVisible = (items: NavItem[]) => items.filter(isItemVisible).sort(byPermissionOrder);

  // Groups with their access-filtered, re-ordered children; a group
  // with nothing left to show is dropped rather than rendered as an
  // empty toggle.
  const visibleGroups = navGroups
    .map((g) => ({ ...g, children: orderVisible(g.children) }))
    .filter((g) => g.children.length > 0);

  // A group starts expanded whenever one of its children is the
  // current page (otherwise the active row would be hidden), and
  // collapsed on any other page. The user can still toggle it by
  // hand; navigating into a child re-opens it so the active row is
  // never out of sight.
  const activeGroupId =
    navGroups.find((g) => g.children.some((c) => isItemActive(c.href)))?.id ??
    null;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    activeGroupId ? { [activeGroupId]: true } : {},
  );
  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups((prev) =>
        prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true },
      );
    }
  }, [activeGroupId]);
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name;

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Reference `.nav-item`: 40px row, 10px radius, mint pill when active
  // with the icon picked out in teal.
  const rowClass = (active: boolean) =>
    cn(
      "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors",
      active
        ? "bg-mint font-semibold text-navy [&>svg]:text-teal dark:text-foreground"
        : "text-muted-foreground hover:bg-sunken hover:text-foreground",
    );
  const countClass =
    "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-mint px-1.5 text-[11px] font-bold text-teal-700";

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label={t("closeMenu")}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          "fixed inset-y-0 left-0 z-40 flex h-full w-[248px] flex-col border-r border-sidebar-border bg-sidebar",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: static, always visible — reset all the mobile framing.
          "lg:static lg:z-0 lg:w-[248px] lg:translate-x-0 lg:transition-none",
        )}
        aria-label="Primary"
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-[18px] pb-1">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Logo className="h-[34px] w-[34px]" title="" />
            <span className="flex flex-col">
              <span className="font-heading text-lg leading-[1.1] font-bold text-navy dark:text-foreground">
                {t("title")}
              </span>
              <span className="text-[11px] text-muted-foreground">{t("tagline")}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4">
          <ul className="flex flex-col gap-0.5">
            {orderVisible(navItems).map((item) => {
              const isActive = isItemActive(item.href);

              const showUnreadDot =
                item.href === "/inbox" && totalUnread > 0 && !isActive;

              // Unlike the inbox dot, the notifications count stays visible
              // even while the page is active — it reflects unread state
              // (cleared by marking notifications read), not "currently
              // viewing this section".
              const showNotificationBadge =
                item.href === "/notifications" && unreadNotifications > 0;

              return (
                <li key={item.href}>
                  <Link href={item.href} className={rowClass(isActive)}>
                    <item.icon className="size-[18px]" strokeWidth={1.75} />
                    <span className="flex-1">{t(item.labelKey as string)}</span>
                    {item.beta && (
                      <span
                        aria-label={t("beta")}
                        className="rounded-full bg-warn-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warn-fg"
                      >
                        {t("beta")}
                      </span>
                    )}
                    {showUnreadDot && (
                      <span
                        aria-label={t("unreadConversations", { count: totalUnread })}
                        className={countClass}
                      >
                        {totalUnread > 99 ? "99+" : totalUnread}
                      </span>
                    )}
                    {showNotificationBadge && (
                      <span
                        aria-label={t("unreadNotifications", { count: unreadNotifications })}
                        className={countClass}
                      >
                        {unreadNotifications > 9 ? "9+" : unreadNotifications}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Collapsible groups — a toggle row plus an indented sub-list. */}
          {visibleGroups.map((group) => {
            const isOpen = !!openGroups[group.id];
            const childActive = group.id === activeGroupId;
            const listId = `sidebar-group-${group.id}`;
            return (
              <ul key={group.id} className="mt-0.5 flex flex-col gap-0.5">
                <li>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    className={cn(
                      "flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors",
                      childActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-sunken hover:text-foreground",
                    )}
                  >
                    <group.icon className="size-[18px]" strokeWidth={1.75} />
                    <span className="flex-1 text-left">{t(group.labelKey)}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isOpen ? "rotate-180" : "rotate-0",
                      )}
                    />
                  </button>
                  {isOpen && (
                    <ul
                      id={listId}
                      className="mt-0.5 ml-[21px] flex flex-col gap-0.5 border-l border-border pl-2"
                    >
                      {group.children.map((item) => {
                        const isActive = isItemActive(item.href);
                        return (
                          <li key={item.href}>
                            <Link href={item.href} className={cn(rowClass(isActive), "h-9 text-[13.5px]")}>
                              <item.icon className="size-4" strokeWidth={1.75} />
                              <span className="flex-1">{t(item.labelKey)}</span>
                              {item.beta && (
                                <span
                                  aria-label={t("beta")}
                                  className="rounded-full bg-warn-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warn-fg"
                                >
                                  {t("beta")}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              </ul>
            );
          })}

          {afterGroupItems.filter(isItemVisible).length > 0 && (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {afterGroupItems.filter(isItemVisible).map((item) => {
                const isActive = isItemActive(item.href);
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={rowClass(isActive)}>
                      <item.icon className="size-[18px]" strokeWidth={1.75} />
                      <span className="flex-1">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <ul className="mt-0.5 flex flex-col gap-0.5">
            {bottomNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} className={rowClass(isActive)}>
                    <item.icon className="size-[18px]" strokeWidth={1.75} />
                    {t(item.labelKey as string)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer: AI receptionist status, account strip, user menu —
            the three stacked cards at the foot of the reference sidebar. */}
        <div className="flex shrink-0 flex-col gap-3 px-3.5 pb-4">
          <Link
            href="/agents"
            className="flex gap-2.5 rounded-[14px] border border-border bg-card-2 p-3 transition-colors hover:bg-sunken"
          >
            <span
              className={cn(
                "flex size-[34px] shrink-0 items-center justify-center rounded-full bg-mint text-teal",
                ai.active && "ai-pulse",
              )}
            >
              <Sparkles className="relative size-4" strokeWidth={1.75} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground">{t("aiReceptionist")}</span>
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold",
                  ai.active ? "text-teal-700" : "text-muted-foreground",
                )}
              >
                <i className="size-[7px] rounded-full bg-current" />
                {!ai.loaded ? "…" : ai.active ? t("aiOnline") : t("aiOffline")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {ai.autoReply ? t("aiHandling") : t("aiIdle")}
              </span>
            </span>
          </Link>
          {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
          {showAccountStrip && account?.name ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#3E6FB5] text-xs font-bold text-white">
                {account.name.slice(0, 2).toUpperCase()}
              </span>
              {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground" title={account.name}>
                {account.name}
              </span>
              {accountRole ? (
                // Always render the chip — owners used to be
                // invisible here, which made them indistinguishable
                // from admins at a glance. Now everyone sees their
                // role (with a colour cue) regardless of tier.
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.className}`}
                    >
                      <Icon className="size-3" />
                      {t(meta.labelKey as string)}
                    </span>
                  );
                })()
              ) : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-sunken focus:bg-sunken focus:outline-none data-popup-open:bg-sunken">
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t("defaultAvatar")}
                  />
                ) : null}
                <AvatarFallback className="bg-[#E9EEF4] text-xs font-bold text-navy">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {profile?.full_name ?? t("defaultUser")}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {profile?.email ?? ""}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4" />
                {t("menuProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
                {t("menuSettings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                {t("menuSignOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
