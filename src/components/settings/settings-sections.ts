import {
  Coins,
  FileText,
  KeyRound,
  LockKeyhole,
  LayoutGrid,
  Palette,
  PlugZap,
  Shield,
  Tags,
  User,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

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
  'deals',
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
 * Sections that now live on their own top-level route rather than in
 * the settings rail. The settings page forwards `?tab=<section>` to
 * the href so Overview tiles and older links keep working. Master
 * sections are included via `masterHref`; anything else is listed
 * explicitly.
 */
export function movedSectionHref(section: SettingsSection): string | null {
  if (isMasterSection(section)) return masterHref(section);
  if (section === 'access') return '/access-control';
  return null;
}

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  /** `master` / `moved` sections render on their own routes, not in the settings rail. */
  group: 'top' | 'account' | 'workspace' | 'master' | 'moved';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', label: 'Your profile', icon: User, group: 'account' },
  security: { id: 'security', label: 'Login & security', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  templates: { id: 'templates', label: 'Templates', icon: FileText, group: 'master' },
  'quick-replies': { id: 'quick-replies', label: 'Quick replies', icon: Zap, group: 'master' },
  fields: { id: 'fields', label: 'Fields & tags', icon: Tags, group: 'master' },
  deals: { id: 'deals', label: 'Deals & currency', icon: Coins, group: 'master' },
  members: { id: 'members', label: 'Team members', icon: UsersRound, group: 'workspace' },
  access: { id: 'access', label: 'Access control', icon: LockKeyhole, group: 'moved' },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
};

// `master` and `moved` are intentionally absent — those sections live
// in the sidebar (Master group / top-level), not the settings rail.
export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Account', group: 'account' },
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
