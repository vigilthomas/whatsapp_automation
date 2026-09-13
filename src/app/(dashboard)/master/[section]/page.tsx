'use client';

import { notFound, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import {
  isMasterSection,
  type MasterSection,
} from '@/components/settings/settings-sections';
import { MasterRecordsPanel } from '@/components/master/master-records-panel';
import { isMasterEntitySlug } from '@/lib/master/entities';

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
  const t = useTranslations('Master');

  // Two kinds of section share this route: the clinic master-data
  // entities (clinics / doctors / clinic-admins → one generic CRUD
  // panel driven by the registry) and the reference panels that moved
  // out of Settings.
  let panel: React.ReactNode;
  if (params.section === 'users') {
    // Users = the account's members (invite, role, designation). Same
    // component as Settings → Team members; this is its Master home.
    panel = <MembersTab />;
  } else if (isMasterEntitySlug(params.section)) {
    panel = <MasterRecordsPanel slug={params.section} />;
  } else if (isMasterSection(params.section)) {
    const section: MasterSection = params.section;
    const panels: Record<MasterSection, React.ReactNode> = {
      templates: <TemplateManager />,
      'quick-replies': <QuickRepliesManager />,
      fields: <FieldsAndTagsPanel />,
      deals: <DealsSettings />,
    };
    panel = panels[section];
  } else {
    notFound();
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pageDesc')}</p>
      </div>
      <div className="mt-6 min-w-0">{panel}</div>
    </div>
  );
}
