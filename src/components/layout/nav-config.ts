/**
 * The sidebar's items and groups. Shared by the sidebar and Settings →
 * Sidebar menu (which renames, re-icons, moves and hides them; see
 * src/lib/branding-menu.ts).
 */
import {
  BadgeCheck,
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  Coins,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  MessageSquare,
  Radio,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Tags,
  Users,
  UsersRound,
  Workflow,
  Zap,
} from "lucide-react";
import type { ModuleId } from "@/lib/auth/module-access";
import type { MenuSection } from "@/lib/branding-menu";

export interface NavItem {
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
export interface NavGroup {
  id: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  children: NavItem[];
}

export const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare, module: "inbox" },
  { href: "/appointments", labelKey: "appointments", icon: CalendarDays, module: "appointments" },
  { href: "/notifications", labelKey: "notifications", icon: Bell, module: "notifications" },
];

export const navGroups: NavGroup[] = [
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
      { href: "/master/templates", labelKey: "templates", icon: FileText, module: "templates" },
      { href: "/master/quick-replies", labelKey: "quickReplies", icon: Zap, module: "quick-replies" },
      { href: "/master/fields", labelKey: "fields", icon: Tags, module: "fields" },
      { href: "/master/deals", labelKey: "deals", icon: Coins, module: "deals" },
    ],
  },
];

// Rendered after the collapsible groups, before the divider.
export const afterGroupItems: NavItem[] = [
  { href: "/access-control", labelKey: "accessControl", icon: LockKeyhole, adminOnly: true },
];

export const bottomNavItems: NavItem[] = [
  { href: "/settings", labelKey: "settings", icon: Settings },
];

/** Every place an item can sit: the top list, each group, then the two fixed lists. */
export function menuSections(): MenuSection<NavItem>[] {
  return [
    { id: "top", items: navItems },
    ...navGroups.map((g) => ({ id: g.id, items: g.children })),
    { id: "after", items: afterGroupItems },
    { id: "bottom", items: bottomNavItems },
  ];
}
