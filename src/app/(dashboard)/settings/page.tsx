'use client';

import { PageHeading } from '@/components/layout/page-heading';
import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { BrandingPanel } from '@/components/settings/branding-panel';
import { BusinessTypePanel } from '@/components/settings/business-type-panel';
import { DashboardCardsPanel } from '@/components/settings/dashboard-cards-panel';
import { ClinicPanel } from '@/components/settings/clinic-panel';
import { AiPanel } from '@/components/settings/ai-panel';
import { MenuPanel } from '@/components/settings/menu-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { AccessControlPanel } from '@/components/settings/access-control-panel';
import {
  SECTION_META,
  allowedSection,
  movedSectionHref,
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';
import { actionsFor } from '@/lib/auth/permissions';

// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=whatsapp`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency, can } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const asked = resolveSection(searchParams.get('tab'));
  // Access control: a section this designation can't open falls back to
  // the first one it can; with none at all, back to the dashboard.
  const section = allowedSection(asked, (m) => can(m, 'read'));
  const gate = section ? SECTION_META[section].module : undefined;
  const readOnly = !!gate && actionsFor(gate).includes('edit') && !can(gate, 'edit');

  // Some sections moved to their own routes (/master/<section>,
  // /access-control). A legacy `?tab=` deep link (or an Overview tile)
  // forwards there instead of rendering inline, so one URL owns each
  // panel.
  const movedHref = movedSectionHref(asked);
  const away = movedHref ?? (section ? null : '/dashboard');
  useEffect(() => {
    if (away) router.replace(away);
  }, [away, router]);

  const go = (next: SettingsSection) => {
    const href = movedSectionHref(next);
    if (href) {
      router.push(href);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency],
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    branding: <BrandingPanel />,
    business: <BusinessTypePanel />,
    dashboard: <DashboardCardsPanel />,
    clinic: <ClinicPanel />,
    ai: <AiPanel />,
    menu: <MenuPanel />,
    whatsapp: <WhatsAppConfig />,
    templates: <TemplateManager />,
    'quick-replies': <QuickRepliesManager />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    access: <AccessControlPanel />,
    api: <ApiKeysSettings />,
  };

  if (!section) return null;

  return (
    <div>
      <PageHeading fallback={t('pageTitle')} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} />
        {/* Without the write tick the section opens, but nothing in it can be changed. */}
        <fieldset disabled={readOnly} className="min-w-0">
          {readOnly ? (
            <p className="mb-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {t('readOnly')}
            </p>
          ) : null}
          {panel[section]}
        </fieldset>
      </div>
    </div>
  );
}
