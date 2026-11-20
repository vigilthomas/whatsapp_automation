"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { ChevronDown, Folder, LayoutDashboard, X } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { useBranding } from "@/hooks/use-branding";
import { orderGroupIds, resolveMenu, type ResolvedItem } from "@/lib/branding-menu";
import { BRAND_ICONS } from "@/lib/branding-icons";

import {
  menuSections,
  navGroups,
  type NavItem,
} from "./nav-config";


/** An item's icon, or the one chosen in Settings → Sidebar menu. */
function NavIcon({ item, className }: { item: { icon: typeof LayoutDashboard; iconKey?: string }; className: string }) {
  const Icon = (item.iconKey && BRAND_ICONS[item.iconKey]) || item.icon;
  return <Icon className={className} strokeWidth={1.75} />;
}

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

import { useTranslations } from "next-intl";

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { sidebarModules, canManageMembers } = useAuth();
  const { branding, canEdit: canEditBranding } = useBranding();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();

  const isItemActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href));

  // Visibility and order both come from the member's permissions: a
  // module shows only with `view`, and rows follow the order the
  // designation was arranged in (Access control). Rows without a
  // module (dashboard, settings) are fixed.
  const isItemVisible = (item: NavItem) =>
    (!item.module || sidebarModules.includes(item.module)) &&
    (!item.adminOnly || canManageMembers) &&
    (!item.clinicAdminOnly || canEditBranding);
  const byPermissionOrder = (a: NavItem, b: NavItem) => {
    const ia = a.module ? sidebarModules.indexOf(a.module) : -1;
    const ib = b.module ? sidebarModules.indexOf(b.module) : -1;
    return ia - ib;
  };
  // A section ordered in Settings → Sidebar menu keeps that order; otherwise
  // the designation's order (Access control) applies.
  const orderVisible = (items: NavItem[], ordered?: boolean) =>
    ordered ? items.filter(isItemVisible) : items.filter(isItemVisible).sort(byPermissionOrder);

  // Groups with their access-filtered, re-ordered children; a group
  // with nothing left to show is dropped rather than rendered as an
  // empty toggle.
  // Settings → Sidebar menu: names, icons, groups and hiding. Applied before
  // the permission filter, which still decides what each member may see.
  const menu = resolveMenu<NavItem>(menuSections(), branding.menu);
  const section = (id: string) => menu.find((s) => s.id === id)!;
  const topItems = section("top").items;
  const groupIds = orderGroupIds(navGroups.map((g) => g.id), branding.menu);
  // Built-in groups keep their icon; a section added in Sidebar menu has its chosen one (or a folder).
  const brandedGroups = groupIds.map((id) => {
    const base = navGroups.find((g) => g.id === id);
    const s = section(id);
    return {
      id,
      labelKey: base?.labelKey ?? "",
      icon: base?.icon ?? ((s.iconKey && BRAND_ICONS[s.iconKey]) || Folder),
      label: s.label,
      children: s.items,
      ordered: s.ordered,
    };
  });
  const label = (item: ResolvedItem<NavItem>) => item.label ?? t(item.labelKey as string);

  const visibleGroups = brandedGroups
    .map((g) => ({ ...g, children: orderVisible(g.children, g.ordered) }))
    .filter((g) => g.children.length > 0);

  // A group starts expanded whenever one of its children is the
  // current page (otherwise the active row would be hidden), and
  // collapsed on any other page. The user can still toggle it by
  // hand; navigating into a child re-opens it so the active row is
  // never out of sight.
  const activeGroupId =
    brandedGroups.find((g) => g.children.some((c) => isItemActive(c.href)))?.id ??
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
            <BrandMark className="h-[34px] w-[34px]" />
            <span className="flex min-w-0 flex-col">
              <span
                className="truncate font-heading text-lg leading-[1.1] font-bold text-navy dark:text-foreground"
                style={branding.title_color ? { color: "var(--brand-title)" } : undefined}
              >
                {branding.title || t("title")}
              </span>
              <span
                className="truncate text-[11px] text-muted-foreground"
                style={branding.subtitle_color ? { color: "var(--brand-subtitle)" } : undefined}
              >
                {branding.subtitle || t("tagline")}
              </span>
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
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 py-4">
          <ul className="flex flex-col gap-0.5">
            {orderVisible(topItems, section("top").ordered).map((item) => {
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
                    <NavIcon item={item} className="size-[18px]" />
                    <span className="flex-1">{label(item)}</span>
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
                    <span className="flex-1 text-left">{group.label ?? t(group.labelKey)}</span>
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
                              <NavIcon item={item} className="size-4" />
                              <span className="flex-1">{label(item)}</span>
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

          {section("after").items.filter(isItemVisible).length > 0 && (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {section("after").items.filter(isItemVisible).map((item) => {
                const isActive = isItemActive(item.href);
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={rowClass(isActive)}>
                      <NavIcon item={item} className="size-[18px]" />
                      <span className="flex-1">{label(item)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

        </nav>

        {/* Pinned to the foot of the sidebar (Access control, Sidebar menu,
            Settings). Outside the scrolling <nav> so it stays in view however
            many groups are open. */}
        <div className="shrink-0 px-3.5 pb-4">
          <ul className="flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
            {section("bottom").items.filter(isItemVisible).map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} className={rowClass(isActive)}>
                    <NavIcon item={item} className="size-[18px]" />
                    {label(item)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}
