'use client';

import { useEffect } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';

import { PrimaryPanel } from '@/components/settings/settings-panel-head';

import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { UsersPanel } from '@/components/master/users-panel';
import {
  isMasterSection,
  type MasterSection,
} from '@/components/settings/settings-sections';
import { MasterRecordsPanel } from '@/components/master/master-records-panel';
import { StaffPanel } from '@/components/master/staff-panel';
import { MASTER_ENTITIES, isMasterEntitySlug } from '@/lib/master/entities';

/** Lists that were merged into another page (one clinic, many branches). */
const MOVED: Record<string, string> = {
  clinics: '/master/branches',
  'clinic-admins': '/master/users',
  doctors: '/master/users',
  members: '/master/users',
  deals: '/settings?tab=deals',
};

/**
 * Master data — the reference-data panels that used to live under
 * Settings → Workspace (templates, quick replies, fields & tags, deals
 * & currency), now surfaced as first-class pages under the "Master"
 * sidebar group. The panels themselves are unchanged and still ship
 * their own SettingsPanelHead; this page only supplies the route and
 * the page-level heading.
 *
 * `/settings?tab=<one of these>` still resolves — the settings page
 * forwards it here — so older links and the Overview tiles keep
 * working.
 */
export default function MasterSectionPage() {
  const params = useParams<{ section: string }>();
  const router = useRouter();
  const moved = MOVED[params.section];
  useEffect(() => {
    if (moved) router.replace(moved);
  }, [moved, router]);

  // Two kinds of section share this route: the master-data entities
  // (branches / services / roles → one generic CRUD
  // panel driven by the registry) and the reference panels that moved
  // out of Settings.
  let panel: React.ReactNode;
  if (moved) {
    return null;
  } else if (params.section === 'users') {
    // Users = everyone who signs in (team members included): add with a
    // password or an invite link, set branch / role / access inline.
    panel = <UsersPanel />;
  } else if (params.section === 'staff') {
    // Doctors: the records list plus a Login column.
    panel = <StaffPanel />;
  } else if (isMasterEntitySlug(params.section) && !MASTER_ENTITIES[params.section].readOnly) {
    panel = <MasterRecordsPanel slug={params.section} />;
  } else if (isMasterSection(params.section)) {
    const section: MasterSection = params.section;
    const panels: Record<MasterSection, React.ReactNode> = {
      templates: <TemplateManager />,
      'quick-replies': <QuickRepliesManager />,
      fields: <FieldsAndTagsPanel />,
      members: <UsersPanel />,
    };
    panel = panels[section];
  } else {
    notFound();
  }

  // No "Master" heading: the panel's own head is the page title, and it
  // shows this page's sidebar name (PrimaryPanel).
  return (
    <div className="min-w-0">
      <PrimaryPanel>{panel}</PrimaryPanel>
    </div>
  );
}
