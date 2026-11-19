"use client";

/**
 * usePageLabel — the sidebar's name for the page you're on.
 *
 * Page titles follow the menu: when an admin renames "Contacts" to
 * "Customers" in Workspace → Sidebar menu, the Contacts page heading (and
 * the mobile header) say "Customers" too. Resolution uses the same
 * `resolveMenu` as the sidebar, so the two can't disagree.
 *
 * Matching picks the longest menu href that is the path itself or a
 * parent of it (`/master/branches` for `/master/branches`, `/broadcasts`
 * for `/broadcasts/new`). Returns `fallback` when no menu item matches.
 */
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { useBranding } from "@/hooks/use-branding";
import { resolveMenu } from "@/lib/branding-menu";
import { menuSections, type NavItem } from "@/components/layout/nav-config";

export function matchMenuItem<T extends { href: string }>(items: T[], pathname: string): T | undefined {
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function usePageLabel(fallback?: string): string | undefined {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { branding } = useBranding();
  const items = resolveMenu<NavItem>(menuSections(), branding.menu).flatMap((s) => s.items);
  const item = matchMenuItem(items, pathname);
  if (!item) return fallback;
  return item.label ?? t(item.labelKey as string);
}
