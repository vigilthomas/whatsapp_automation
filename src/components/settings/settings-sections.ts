import {
  Bot,
  Building2,
  Coins,
  FileText,
  KeyRound,
  LockKeyhole,
  LayoutGrid,
  PanelLeft,
  Paintbrush,
  Palette,
  PlugZap,
  Shield,
  Tags,
  User,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { ModuleId } from '@/lib/auth/module-access';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'branding',
  'clinic',
  'ai',
  'menu',
  'whatsapp',
  'templates',
  'quick-replies',
  'fields',
  'deals',
  'members',
  'access',
  'api',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/**
 * Sections that moved out of Settings into the "Master" sidebar group
 * (`/master/<section>`). They keep their SettingsSection id so the
 * Overview tiles and legacy `?tab=` links still resolve — the settings
 * page forwards them to the Master route instead of rendering inline.
 */
export const MASTER_SECTIONS = [
  'templates',
  'quick-replies',
  'fields',
  'members',
] as const satisfies readonly SettingsSection[];

export type MasterSection = (typeof MASTER_SECTIONS)[number];

export function isMasterSection(value: unknown): value is MasterSection {
  return (
    typeof value === 'string' &&
    (MASTER_SECTIONS as readonly string[]).includes(value)
  );
}

export function masterHref(section: MasterSection): string {
  return `/master/${section}`;
}

/**
 * Sections served from `/workspace/<section>`. Branding, WhatsApp and API
 * keys moved back into Settings (a "Workspace" group in the rail); only
 * the Sidebar menu editor keeps its own route, linked from the foot of
 * the sidebar.
 */
export const WORKSPACE_SECTIONS = ['menu'] as const satisfies readonly SettingsSection[];

export type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number];

export function isWorkspaceSection(value: unknown): value is WorkspaceSection {
  return (
    typeof value === 'string' &&
    (WORKSPACE_SECTIONS as readonly string[]).includes(value)
  );
}

export function workspaceHref(section: WorkspaceSection): string {
  return `/workspace/${section}`;
}

/**
 * Sections that now live on their own top-level route rather than in
 * the settings rail. The settings page forwards `?tab=<section>` to
 * the href so Overview tiles and older links keep working. Master
 * sections are included via `masterHref`; anything else is listed
 * explicitly.
 */
export function movedSectionHref(section: SettingsSection): string | null {
  if (isMasterSection(section)) return masterHref(section);
  if (isWorkspaceSection(section)) return workspaceHref(section);
  if (section === 'access') return '/access-control';
  return null;
}

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  /** `master` / `workspace` / `moved` sections render on their own routes, not in the settings rail. */
  group: 'top' | 'account' | 'preferences' | 'workspace' | 'master' | 'moved';
  /** Only account owners and admins see it in the rail. */
  adminOnly?: boolean;
  /** Only the clinic's own owners and admins (see `can_edit_branding`, migration 047). */
  clinicAdminOnly?: boolean;
  /** Access control gates it on this module (view → in the rail, read → opens, write → saves). */
  module?: ModuleId;
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'top', module: 'settings-overview' },
  profile: { id: 'profile', label: 'Your profile', icon: User, group: 'account', module: 'settings-profile' },
  security: { id: 'security', label: 'Login & security', icon: Shield, group: 'account', module: 'settings-security' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account', module: 'settings-appearance' },
  branding: { id: 'branding', label: 'Branding', icon: Paintbrush, group: 'workspace', clinicAdminOnly: true },
  clinic: { id: 'clinic', label: 'Clinic', icon: Building2, group: 'workspace', module: 'settings-clinic' },
  ai: { id: 'ai', label: 'AI assistant', icon: Bot, group: 'workspace', module: 'ai-assistant' },
  menu: { id: 'menu', label: 'Sidebar menu', icon: PanelLeft, group: 'moved', clinicAdminOnly: true },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  templates: { id: 'templates', label: 'Templates', icon: FileText, group: 'master' },
  'quick-replies': { id: 'quick-replies', label: 'Quick replies', icon: Zap, group: 'master' },
  fields: { id: 'fields', label: 'Fields & tags', icon: Tags, group: 'master' },
  deals: { id: 'deals', label: 'Currency', icon: Coins, group: 'preferences', module: 'deals' },
  members: { id: 'members', label: 'Team members', icon: UsersRound, group: 'master' },
  access: { id: 'access', label: 'Access control', icon: LockKeyhole, group: 'moved' },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
};

// `master` and `moved` are intentionally absent — those sections live
// in the sidebar (Master group, Access control, Sidebar menu).
export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Account', group: 'account' },
  { label: 'Preferences', group: 'preferences' },
  { label: 'Workspace', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}

/** Whether the settings rail lists a section for this member. */
export function railShows(
  meta: SectionMeta,
  who: {
    canManageMembers: boolean;
    canEditBranding: boolean;
    /** Access control's view tick; omitted = allowed. */
    canView?: (module: ModuleId) => boolean;
  },
): boolean {
  if (meta.module && who.canView && !who.canView(meta.module)) return false;
  if (meta.clinicAdminOnly) return who.canEditBranding;
  return !meta.adminOnly || who.canManageMembers;
}

/** The Settings rail sections that live on the settings page itself, in rail order. */
export const PAGE_SECTIONS = SETTINGS_SECTIONS.filter((s) => SECTION_META[s].module);

/**
 * Which section the settings page should open: the asked-for one when
 * `canRead` allows it, else the first page section that's allowed, else
 * null (none — send them away). Sections without a module (the moved
 * ones, which forward elsewhere) always pass.
 */
export function allowedSection(
  section: SettingsSection,
  canRead: (module: ModuleId) => boolean,
): SettingsSection | null {
  const gate = SECTION_META[section].module;
  if (!gate || canRead(gate)) return section;
  return PAGE_SECTIONS.find((s) => canRead(SECTION_META[s].module!)) ?? null;
}
