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
  isPersonalSection,
  resolveSection,
  type SettingsScope,
  type SettingsSection,
} from '@/components/settings/settings-sections';
import { actionsFor } from '@/lib/auth/permissions';

/**
 * One settings screen, two pages: Admin settings (/settings, the
 * business's setup) and Settings (/account, the signed-in person's
 * profile, login & security and appearance). `scope` picks which
 * sections the rail lists and opens; a section that belongs to the other
 * page forwards there (movedSectionHref).
 */
// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=whatsapp`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export function SettingsScreen({ scope }: { scope: SettingsScope }) {
  return (
    <Suspense fallback={null}>
      <SettingsScreenInner scope={scope} />
    </Suspense>
  );
}

function SettingsScreenInner({ scope }: { scope: SettingsScope }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency, can } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const asked = resolveSection(searchParams.get('tab'), scope);
  // Access control: a section this designation can't open falls back to
  // the first one it can; with none at all, back to the dashboard.
  const section = allowedSection(asked, (m) => can(m, 'read'), scope);
  const gate = section ? SECTION_META[section].module : undefined;
  const readOnly = !!gate && actionsFor(gate).includes('edit') && !can(gate, 'edit');

  // Some sections moved to their own routes (/master/<section>,
  // /access-control). A legacy `?tab=` deep link (or an Overview tile)
  // forwards there instead of rendering inline, so one URL owns each
  // panel.
  // On Admin settings an Account section (asked, or the only one this
  // role may read) forwards to /account; the personal page never forwards.
  const movedHref = scope === 'admin' ? movedSectionHref(section ?? asked) : null;
  const away = movedHref ?? (section ? null : '/dashboard');
  useEffect(() => {
    if (away) router.replace(away);
  }, [away, router]);

  const go = (next: SettingsSection) => {
    const href = scope === 'personal' && isPersonalSection(next) ? null : movedSectionHref(next);
    if (href) {
      router.push(href);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${scope === 'personal' ? '/account' : '/settings'}?${params.toString()}`, { scroll: false });
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

  if (!section || movedHref) return null;

  return (
    <div>
      <PageHeading fallback={scope === 'personal' ? t('pageTitle') : t('adminPageTitle')} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} scope={scope} />
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
